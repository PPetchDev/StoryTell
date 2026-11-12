import { TimeOfDay } from '../../../model/chat/entities/chat.entity.js';
import { BOND_AXES, BOND_AXIS_NAMES, BondLevels, clampToRange, sameBondLevels } from '../../../model/ledger/bond-axes.js';
import { MessageChanges, NewBondChange, PartEmotion } from '../../../model/ledger/ledger.service.js';
import { PASSED_BY_REPLIES } from '../scene-replies.js';
import { BondGate, bondGateInWords, GateBond, gatesHold } from './bond-gates.js';
import { Judgement, JudgedExpression } from './judge-prompt.js';

/**
 * The backend rules for applying a judgement (spec: "Backend rules when applying a
 * judgement"): drop unknown names and self-Bonds, drop a Bond "change" that changes neither the
 * label nor any level (.scratch/bond-axes/spec.md), hold levels to the step limits, keep one
 * change per Bond per turn, advance at most one Scene, drop a Time of day equal to the current
 * one. A Character sitting out gets no Bond change from them and no Arc step. Pure logic.
 */

export interface ApplyCastMember {
    id: number;
    name: string;
}

export interface ApplyBond {
    fromCharacterId: number;
    toCharacterId: number | null;
    label: string;
    description: string;
    /** null while the Bond has no levels yet. */
    levels: BondLevels | null;
}

export interface ApplyScene {
    id: number;
    name: string;
    /** Left out, the Scene reads as having one: the Judge's move_on decides, as before gates. */
    moveOnCondition?: string;
    /** Its Bond gates (.scratch/bond-axes/spec.md); none, or left out, and the Judge's move_on alone decides. */
    gates?: BondGate[];
}

export interface ApplyInput {
    cast: ApplyCastMember[];
    /** The worn identity's name; the judge may write it instead of "user". */
    identityName: string;
    /** The current value of every Bond in the Chat. */
    bonds: ApplyBond[];
    /** The Story's Scenes in order, and the one the Chat is on (null: free play). */
    scenes: ApplyScene[];
    currentSceneId: number | null;
    /** The Chat's Time of day now; null while there is none. Left out, it reads as null. */
    timeOfDay?: TimeOfDay | null;
    /**
     * The ids of the Characters sitting out (.scratch/speaker-controls/spec.md): their own feelings
     * and Arc stay as they were, while others' feelings toward them may still change.
     */
    sittingOut?: number[];
    /**
     * The replies in the current Scene, the judged one included (.scratch/scene-flow/spec.md); a
     * passed_by is allowed only from `PASSED_BY_REPLIES`. Null or left out (free play): never.
     */
    repliesInScene?: number | null;
}

export interface AppliedJudgement extends MessageChanges {
    /** Why each dropped item was dropped, for the log. */
    rejected: string[];
    /** The Judge's reason when the Scene moved on because the story passed it by; otherwise null. */
    passedBy: string | null;
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function applyJudgement(input: ApplyInput, judgement: Judgement): AppliedJudgement {
    const rejected: string[] = [];
    const byName = (name: string): ApplyCastMember | undefined =>
        input.cast.find((member) => same(member.name, name));
    const bondKey = (fromId: number, toId: number | null): string => `${fromId}->${toId ?? 'user'}`;
    const current = new Map(input.bonds.map((bond) => [bondKey(bond.fromCharacterId, bond.toCharacterId), bond]));

    const sittingOut = new Set(input.sittingOut ?? []);
    const bonds: NewBondChange[] = [];
    const changed = new Set<string>();
    for (const change of judgement.bondChanges) {
        const from = byName(change.from);
        const towardUser = same(change.to, 'user') || same(change.to, input.identityName);
        const to = towardUser ? null : byName(change.to);
        if (!from || (!towardUser && !to)) {
            rejected.push(`Bond ${change.from} → ${change.to}: unknown name`);
            continue;
        }
        if (sittingOut.has(from.id)) {
            rejected.push(`Bond ${from.name} → ${change.to}: ${from.name} is sitting out`);
            continue;
        }
        const toId = to?.id ?? null;
        if (toId === from.id) {
            rejected.push(`Bond ${from.name} → ${from.name}: a Character's feelings toward itself`);
            continue;
        }
        const key = bondKey(from.id, toId);
        if (changed.has(key)) {
            rejected.push(`Bond ${key}: a second change in one turn`);
            continue;
        }
        const before = current.get(key);
        const step = stepLevels(before?.levels ?? null, change.levels);
        for (const clamp of step.clamped) rejected.push(`Bond ${key}: ${clamp}`);
        const sameLabel = before !== undefined && same(before.label, change.label);
        if (sameLabel && sameBondLevels(before.levels, step.levels)) {
            rejected.push(`Bond ${key}: same label "${change.label}" and levels — not a change`);
            continue;
        }
        changed.add(key);
        bonds.push({
            fromCharacterId: from.id,
            toCharacterId: toId,
            // A same-label change only moved levels: it keeps the label as it was written, and its description unless given a new one.
            label: sameLabel ? before.label : change.label,
            description: sameLabel && !change.description ? before.description : change.description,
            levels: step.levels,
            before: before ? { label: before.label, description: before.description } : null,
            event: change.cause,
        });
    }

    const arcs = judgement.arcSteps.flatMap((step) => {
        const character = byName(step.character);
        if (!character) {
            rejected.push(`Arc step for ${step.character}: unknown name`);
            return [];
        }
        if (sittingOut.has(character.id)) {
            rejected.push(`Arc step for ${character.name}: sitting out`);
            return [];
        }
        return [{ characterId: character.id, step: step.step, event: step.cause }];
    });

    let scene: MessageChanges['scene'] = null;
    const moveOn = judgement.scenes.find((signal) => signal.moveOn);
    const index = input.scenes.findIndex((candidate) => candidate.id === input.currentSceneId);
    const here: ApplyScene | undefined = input.scenes[index];
    const gates = here?.gates ?? [];
    // A Scene with gates (.scratch/bond-axes/spec.md, "Moving on"): checked on the Bonds after this
    // turn's changes, so a reply that opens a gate moves the Scene on in the same judgement.
    const gatesOnly = gates.length > 0 && here?.moveOnCondition !== undefined && here.moveOnCondition.trim() === '';
    const held = gates.length === 0 || gatesHold(gates, bondsAfter(input.bonds, bonds)).every(Boolean);
    // A Passed-by Scene (.scratch/scene-flow/spec.md, "Passed by"): only from the threshold, and only
    // when the Scene does not move on by its own rules, which win when both are given.
    const passed = judgement.scenes.find((signal) => signal.passedBy === true);
    const replies = input.repliesInScene ?? null;
    const passedBy = passed && here && replies !== null && replies >= PASSED_BY_REPLIES ? passed : undefined;
    const next: ApplyScene | undefined = input.scenes[index + 1];
    let passedByReason: string | null = null;
    if (here && (gatesOnly ? held : moveOn && held)) {
        const nameOf = (characterId: number | null): string =>
            characterId === null ? input.identityName : (input.cast.find((member) => member.id === characterId)?.name ?? 'someone');
        scene = {
            fromSceneId: here.id,
            fromSceneName: here.name,
            toSceneId: next?.id ?? null,
            toSceneName: next?.name ?? null,
            // When the gates decided it, the event names them.
            event: gatesOnly
                ? gates.map((gate) => bondGateInWords(nameOf(gate.fromCharacterId), nameOf(gate.toCharacterId), gate.axis, gate.atLeast)).join('; ')
                : moveOn!.reason,
        };
        if (judgement.scenes.filter((signal) => signal.moveOn).length > 1) {
            rejected.push('Scene: a second advance in one turn');
        }
    } else if (here && passedBy) {
        // To the next Scene in order, or free play from the last, past the condition and the gates.
        scene = {
            fromSceneId: here.id,
            fromSceneName: here.name,
            toSceneId: next?.id ?? null,
            toSceneName: next?.name ?? null,
            event: `The story moved past ${here.name}: ${passedBy.reason}`,
        };
        passedByReason = passedBy.reason;
    } else if (moveOn && !here) {
        rejected.push('Scene: move on while in free play');
    } else if (moveOn && gatesOnly) {
        rejected.push('Scene: move on for a Scene its Bond gates alone decide');
    } else if (moveOn) {
        rejected.push('Scene: move on while a Bond gate does not hold');
    }
    if (passed && !here) {
        rejected.push('Scene: passed by while in free play');
    } else if (passed && !passedBy) {
        rejected.push(`Scene: passed by with only ${replies ?? 0} replies in the Scene, under ${PASSED_BY_REPLIES}`);
    }

    const now = input.timeOfDay ?? null;
    let time: MessageChanges['time'] = null;
    if (judgement.timeOfDay && judgement.timeOfDay !== now) {
        time = { fromTime: now, toTime: judgement.timeOfDay };
    } else if (judgement.timeOfDay) {
        rejected.push(`Time of day: still ${judgement.timeOfDay} — not a change`);
    }

    return { bonds, arcs, scene, time, rejected, passedBy: passedByReason };
}

/** Every Bond as it stands once this turn's changes are written. */
function bondsAfter(current: readonly ApplyBond[], changes: readonly NewBondChange[]): GateBond[] {
    const after = current.map((bond) => {
        const change = changes.find((c) => c.fromCharacterId === bond.fromCharacterId && c.toCharacterId === bond.toCharacterId);
        return { fromCharacterId: bond.fromCharacterId, toCharacterId: bond.toCharacterId, levels: change ? change.levels : bond.levels };
    });
    const formed = changes.filter(
        (change) => !current.some((bond) => bond.fromCharacterId === change.fromCharacterId && bond.toCharacterId === change.toCharacterId),
    );
    return [...after, ...formed.map((change) => ({ fromCharacterId: change.fromCharacterId, toCharacterId: change.toCharacterId, levels: change.levels }))];
}

/**
 * A Bond's levels after a change (.scratch/bond-axes/spec.md, "Step limits"). Measured levels move
 * at most one step per axis, Tension up to two steps up but one down, and stay in range; an axis the
 * change leaves out, or a change with no `levels`, keeps its level. A Bond with no levels yet takes
 * the judge's as they are (its first measure), the middle for an axis left out; with none given it
 * stays unmeasured. Each clamp is described for the log.
 */
export function stepLevels(
    current: BondLevels | null,
    judged: Partial<BondLevels> | null,
): { levels: BondLevels | null; clamped: string[] } {
    const clamped: string[] = [];
    if (current === null) {
        if (judged === null || BOND_AXES.every((axis) => judged[axis] === undefined)) return { levels: null, clamped };
        const first = Object.fromEntries(
            BOND_AXES.map((axis) => [axis, clampToRange(axis, judged[axis] ?? 0)]),
        ) as BondLevels;
        return { levels: first, clamped };
    }
    if (judged === null) return { levels: current, clamped };
    const levels = { ...current };
    for (const axis of BOND_AXES) {
        const wanted = judged[axis];
        if (wanted === undefined) continue;
        const up = axis === 'tension' ? 2 : 1;
        const moved = clampToRange(axis, Math.min(current[axis] + up, Math.max(current[axis] - 1, wanted)));
        if (moved !== wanted) clamped.push(`${BOND_AXIS_NAMES[axis]} ${current[axis]} → ${wanted} clamped to ${moved}`);
        levels[axis] = moved;
    }
    return { levels, clamped };
}

/**
 * The judge's line tags on the reply's parts (.scratch/expressions/spec.md, "Applying"): line n is
 * the n-th speech part, in order. A number outside 1 to the count of speech parts is dropped, and a
 * repeated number keeps its first tag. Untagged parts are left out, so they stay null. Pure logic.
 */
export function emotionsOfParts(parts: ReadonlyArray<{ id: number; kind: string }>, tags: readonly JudgedExpression[]): PartEmotion[] {
    const speech = parts.filter((part) => part.kind === 'speech');
    const tagged = new Set<number>();
    return tags.flatMap((tag) => {
        const part = speech[tag.line - 1];
        if (tag.line < 1 || !part || tagged.has(tag.line)) return [];
        tagged.add(tag.line);
        return [{ partId: part.id, emotion: tag.emotion }];
    });
}

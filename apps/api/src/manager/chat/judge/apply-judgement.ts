import { TimeOfDay } from '../../../model/chat/entities/chat.entity.js';
import { MessageChanges, NewBondChange } from '../../../model/ledger/ledger.service.js';
import { Judgement } from './judge-prompt.js';

/**
 * The backend rules for applying a judgement (spec: "Backend rules when applying a
 * judgement"): drop unknown names and self-Bonds, drop a Bond "change" to the same label,
 * keep one change per Bond per turn, advance at most one Scene, drop a Time of day equal to
 * the current one. Pure logic.
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
}

export interface ApplyScene {
    id: number;
    name: string;
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
}

export interface AppliedJudgement extends MessageChanges {
    /** Why each dropped item was dropped, for the log. */
    rejected: string[];
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

export function applyJudgement(input: ApplyInput, judgement: Judgement): AppliedJudgement {
    const rejected: string[] = [];
    const byName = (name: string): ApplyCastMember | undefined =>
        input.cast.find((member) => same(member.name, name));
    const bondKey = (fromId: number, toId: number | null): string => `${fromId}->${toId ?? 'user'}`;
    const current = new Map(input.bonds.map((bond) => [bondKey(bond.fromCharacterId, bond.toCharacterId), bond]));

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
        if (before && same(before.label, change.label)) {
            rejected.push(`Bond ${key}: same label "${change.label}" — not a change`);
            continue;
        }
        changed.add(key);
        bonds.push({
            fromCharacterId: from.id,
            toCharacterId: toId,
            label: change.label,
            description: change.description,
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
        return [{ characterId: character.id, step: step.step, event: step.cause }];
    });

    let scene: MessageChanges['scene'] = null;
    const moveOn = judgement.scenes.find((signal) => signal.moveOn);
    const index = input.scenes.findIndex((candidate) => candidate.id === input.currentSceneId);
    if (moveOn && index >= 0) {
        const next: ApplyScene | undefined = input.scenes[index + 1];
        scene = {
            fromSceneId: input.scenes[index].id,
            fromSceneName: input.scenes[index].name,
            toSceneId: next?.id ?? null,
            toSceneName: next?.name ?? null,
            event: moveOn.reason,
        };
        if (judgement.scenes.filter((signal) => signal.moveOn).length > 1) {
            rejected.push('Scene: a second advance in one turn');
        }
    } else if (moveOn) {
        rejected.push('Scene: move on while in free play');
    }

    const now = input.timeOfDay ?? null;
    let time: MessageChanges['time'] = null;
    if (judgement.timeOfDay && judgement.timeOfDay !== now) {
        time = { fromTime: now, toTime: judgement.timeOfDay };
    } else if (judgement.timeOfDay) {
        rejected.push(`Time of day: still ${judgement.timeOfDay} — not a change`);
    }

    return { bonds, arcs, scene, time, rejected };
}

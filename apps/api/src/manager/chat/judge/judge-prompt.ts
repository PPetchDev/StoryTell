import { UnparseableOutputError } from '../../../errors/model-gateway.errors.js';
import { TimeOfDay, TIMES_OF_DAY } from '../../../model/chat/entities/chat.entity.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { exchangeUserLine } from '../exchange.js';

/**
 * The Bond, Arc, Scene and Time of day judge's prompt and output (spec: "Background judge"), from the turn
 * prototype after its re-judge fix. Pure logic over plain inputs: the manager gathers them.
 */

export interface JudgeCastMember {
    name: string;
    personality: string;
    /** The Arc directions copied into the Chat; empty when the author wrote none. */
    arcDirection: string;
}

export interface JudgeBond {
    fromName: string;
    /** null means toward the user. */
    toName: string | null;
    label: string;
    description: string;
}

export interface JudgeArc {
    name: string;
    steps: string[];
}

export interface JudgePromptInput {
    cast: JudgeCastMember[];
    /** The worn identity's name. The judge refers to the user as "user". */
    identityName: string;
    bonds: JudgeBond[];
    arcs: JudgeArc[];
    scene: { name: string; moveOnCondition: string } | null;
    /** The Chat's Time of day; null while the story has not made one clear. Left out, it reads as null. */
    timeOfDay?: TimeOfDay | null;
    /** The Messages before the exchange, oldest first, as `Name: text` or the AI's `@Name:` text. */
    recent: string[];
    /** The exchange to judge: what the user wrote (null after a Continue) and the AI's reply as `@Name:` text. */
    userText: string | null;
    aiText: string;
}

/** How many Messages before the exchange the judge sees for context. */
export const JUDGE_CONTEXT_MESSAGES = 6;
export const JUDGE_MAX_TOKENS = 700;

const SYSTEM = `You track hidden feelings (Bonds) and lasting personality changes (Arcs) for Characters in an interactive story. You judge only what CHANGED in the latest exchange.

Bond rules:
- A Bond is directional: one Character's feelings toward the user ("user") or toward another Character. Shape: a 1–3 word English label plus a 1–2 sentence description.
- Bonds shift GRADUALLY. Expect NO change on most turns — a normal conversation, flirting, or a feeling simply growing a little stronger is not a change.
- Change a Bond only when the feeling changes in KIND (e.g. suspicion → trust, desire → betrayal), or on a major event (betrayal, rescue, confession, first intimacy, a serious threat). Never just rephrase or intensify the current label.
- At most one change per Bond per turn.
- Only Characters who witnessed the event, or plausibly learned of it, can change.
- Create a new pair only where real feelings have formed.
- Every change must cite the event in the latest exchange that caused it.

Arc rules:
- An Arc step is a lasting change to a Character's personality. It needs a SIGNIFICANT event you can cite and is far rarer than a Bond change — a Character gets perhaps one to three steps in a whole Chat.
- Never add a step that restates, continues or "deepens" the Character's last step. A new step needs a new event causing a DIFFERENT change.
- The core definition is never rewritten; you only add steps. A step can reverse an earlier one.

Scene rule:
- Judge whether the current Scene's move-on condition has now been met, with the Bonds in view. Be strict: met means it has fully HAPPENED in the story by the end of the latest exchange.
- Not met: getting closer, someone about to do it, saying they could or will do it, agreeing to do it later, or the story setting it up.
- When the condition names who must act (the user or a Character), only that one doing it counts. Someone else revealing or doing it instead does not.
- When the condition has several parts, every part must have happened.
- When in doubt, move_on is false. A Scene is meant to last many exchanges.
- Write the reason first, saying what has and has not happened yet, then decide move_on from it.

Time of day rule:
- Give the in-story time of day only when the latest exchange moves it on to a new one, or first makes it clear: one of "dawn", "morning", "noon", "afternoon", "evening" or "night". Otherwise null. Read it from the story (light, meals, sleep, the sky); never guess.

Reply with JSON only:
{"bond_changes":[{"from":"Name","to":"user|Name","label":"...","description":"...","cause":"..."}],
 "arc_steps":[{"character":"Name","step":"...","cause":"..."}],
 "scene":{"reason":"...","move_on":false},
 "time_of_day":null}
Empty arrays when nothing changed.`;

export function buildJudgePrompt(input: JudgePromptInput): { messages: PromptMessage[]; maxTokens: number } {
    const cast = input.cast
        .map(
            (member) =>
                `- ${member.name}: ${member.personality}${
                    member.arcDirection.trim() ? ` (Author's Arc direction: ${member.arcDirection})` : ''
                }`,
        )
        .join('\n');
    const bonds =
        input.bonds
            .map((bond) => `- ${bond.fromName} → ${bond.toName ?? 'user'}: "${bond.label}" — ${bond.description}`)
            .join('\n') || '(none yet — everyone is a stranger)';
    const arcs = input.arcs
        .map((arc) => `- ${arc.name}: ${arc.steps.join(' → ') || 'no steps yet'}`)
        .join('\n');
    const user = `# Cast
${cast}
The user plays ${input.identityName} (refer to them as "user").

# Current Bonds
${bonds}

# Arc steps so far
${arcs}

# Current Scene
${input.scene ? `${input.scene.name}. Move-on condition: ${input.scene.moveOnCondition || '(none)'}` : 'none'}

# Time of day
${input.timeOfDay ?? 'not yet known'}

# Recent story (context)
${input.recent.join('\n\n') || '(start)'}

# LATEST EXCHANGE (judge this)
${exchangeUserLine(input.identityName, input.userText)}

${input.aiText}`;
    return {
        messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: user },
        ],
        maxTokens: JUDGE_MAX_TOKENS,
    };
}

export interface JudgedBondChange {
    from: string;
    to: string;
    label: string;
    description: string;
    cause: string;
}

export interface JudgedArcStep {
    character: string;
    step: string;
    cause: string;
}

export interface JudgedScene {
    moveOn: boolean;
    reason: string;
}

/** The judge's output, read loosely: every item that is not an object with the fields is dropped. */
export interface Judgement {
    bondChanges: JudgedBondChange[];
    arcSteps: JudgedArcStep[];
    /** One entry per move-on signal the judge gave; the backend applies at most one. */
    scenes: JudgedScene[];
    /** The Time of day the story moved on to; null when the judge gave none (unchanged). */
    timeOfDay: TimeOfDay | null;
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** Reads the judge's JSON. Throws `UnparseableOutputError` when there is no JSON object to read. */
export function parseJudgement(text: string): Judgement {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new UnparseableOutputError('The judge wrote no JSON object.');
    let json: unknown;
    try {
        json = JSON.parse(match[0]);
    } catch (error) {
        throw new UnparseableOutputError(`The judge's JSON could not be read: ${(error as Error).message}`);
    }
    if (!isObject(json)) throw new UnparseableOutputError('The judge wrote no JSON object.');

    const bondChanges = list(json.bond_changes).flatMap((item): JudgedBondChange[] =>
        isObject(item) && str(item.from) && str(item.to) && str(item.label)
            ? [
                  {
                      from: str(item.from),
                      to: str(item.to),
                      label: str(item.label),
                      description: str(item.description),
                      cause: str(item.cause),
                  },
              ]
            : [],
    );
    const arcSteps = list(json.arc_steps).flatMap((item): JudgedArcStep[] =>
        isObject(item) && str(item.character) && str(item.step)
            ? [{ character: str(item.character), step: str(item.step), cause: str(item.cause) }]
            : [],
    );
    const scenes = (Array.isArray(json.scene) ? json.scene : [json.scene]).flatMap((item): JudgedScene[] =>
        isObject(item) ? [{ moveOn: item.move_on === true, reason: str(item.reason) }] : [],
    );
    return { bondChanges, arcSteps, scenes, timeOfDay: readTimeOfDay(json.time_of_day) };
}

/** One of the six, in any case; a missing field, a null or anything else means unchanged. */
function readTimeOfDay(value: unknown): TimeOfDay | null {
    const time = str(value).toLowerCase();
    return (TIMES_OF_DAY as readonly string[]).includes(time) ? (time as TimeOfDay) : null;
}

import { UnparseableOutputError } from '../../../errors/model-gateway.errors.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { estimateTokens } from '../turn/prompt.js';

/**
 * Memory extraction's prompt and output (spec: "Memory extraction"). Pure logic over plain
 * inputs: the manager gathers them. The same Memory lines feed the turn prompt's Memory
 * layer and the cap check, so the cap measures what the play model will actually see.
 */

export interface ExtractionMemory {
    id: number;
    /** With `{user}` as written; the extraction keeps the placeholder. */
    text: string;
    knownBy: string[];
    locked: boolean;
}

export interface ExtractionPromptInput {
    cast: string[];
    /** The worn identity's name. The extraction writes `{user}` instead. */
    identityName: string;
    present: string[];
    /** Every non-archived Memory, in the stable order. */
    memories: ExtractionMemory[];
    userText: string;
    aiText: string;
    /** True when the Memory list is over the cap: the call is asked to merge and archive. */
    overCap: boolean;
}

/** Spec: "~2k tokens, roughly 50–60 facts, tunable". The cap is either measure: the tokens of the Memory lines, or their count. */
export const MEMORY_CAP_TOKENS = 2_000;
export const MEMORY_CAP_COUNT = 60;
/** How many Memories the over-cap instruction aims the list back down to. */
export const MEMORY_CAP_TARGET_COUNT = 50;
export const EXTRACTION_MAX_TOKENS = 1_200;
/** Over the cap the answer carries a dozen merges with their text: the first real check used all of 1,200. */
export const EXTRACTION_OVER_CAP_MAX_TOKENS = 2_500;

const SYSTEM = `You maintain the Memory of an interactive story: short facts the story carries forward, each tagged with the Characters who know it. After each exchange you decide what to add, update, delete, merge or archive, and which Characters have now learned of an existing Memory.

What a Memory is:
- An event that happened, a detail of the world that came up in play, something learned about {user}, or an open promise or plan.
- One fact per Memory, one or two plain sentences in the past tense. Name Characters by their exact names and the user as {user}, never by the user's name.
- NEVER a feeling or attitude (those are tracked elsewhere as Bonds), NEVER a change of personality (an Arc), and NEVER anything already in the Story or Character definitions.

Rules:
- Expect nothing to change on many turns. Add only facts the story will need later; skip small talk and passing description.
- Known by lists only the Characters who witnessed the fact or were told of it. Use "known_by" to add a Character who has now learned of an existing Memory. Names are never removed.
- Update a Memory only when the fact itself changed (a plan was altered, a detail corrected). To add detail, add a new Memory rather than rephrasing an old one.
- Memories marked [locked] were written or corrected by the user: never update, delete, merge or archive them. Add a new Memory instead. You may still add Characters to their known_by.
- Delete only a Memory that turned out to be wrong. Archive one only when its fact is finished with: resolved, superseded by a newer Memory, or long past mattering. Never archive a Memory just because this exchange did not mention it.
- Merge only Memories that state the same fact or belong together as one fact.

Reply with JSON only, with these operations (any number, in order, empty when nothing changed):
{"operations":[
 {"op":"add","text":"...","known_by":["Name"],"cause":"..."},
 {"op":"update","id":12,"text":"...","cause":"..."},
 {"op":"known_by","id":12,"names":["Name"],"cause":"..."},
 {"op":"merge","ids":[3,7],"text":"...","known_by":["Name"],"cause":"..."},
 {"op":"archive","id":4,"cause":"..."},
 {"op":"delete","id":5,"cause":"..."}
]}
"cause" is the moment in the exchange that justifies the operation, in a few words.`;

/** The over-cap instruction. Concrete numbers: a small model does little with "merge some". */
function overCapInstruction(count: number): string {
    const needed = Math.max(3, Math.min(12, count - MEMORY_CAP_TARGET_COUNT));
    return `The Memory list is over its size cap: ${count} Memories, where about ${MEMORY_CAP_TARGET_COUNT} fit. Besides the exchange, this turn you MUST return at least ${needed} "merge" or "archive" operations: merge Memories that belong together (the same place, the same plan, the same person) into one Memory each, and archive the ones the story no longer needs. Never archive or merge a [locked] Memory.`;
}

/** A Memory as both the extraction prompt and the turn prompt's Memory layer list it. */
export function memoryLine(memory: { text: string; knownBy: string[] }, extra = ''): string {
    const known = memory.knownBy.length > 0 ? `known by ${memory.knownBy.join(', ')}` : 'known by no one';
    return `- [${known}]${extra} ${memory.text}`;
}

/** Whether the Memory list is over the cap: too many tokens on its prompt lines, or too many Memories. */
export function overMemoryCap(
    memories: Array<{ text: string; knownBy: string[] }>,
    cap: { tokens: number; count: number } = { tokens: MEMORY_CAP_TOKENS, count: MEMORY_CAP_COUNT },
): boolean {
    return memories.length > cap.count || estimateTokens(memories.map((memory) => memoryLine(memory)).join('\n')) > cap.tokens;
}

export function buildExtractionPrompt(input: ExtractionPromptInput): { messages: PromptMessage[]; maxTokens: number } {
    const memories =
        input.memories.map((memory) => `${memory.id}: ${memoryLine(memory, memory.locked ? ' [locked]' : '')}`).join('\n') ||
        '(none yet)';
    const user = `# Cast
${input.cast.map((name) => `- ${name}`).join('\n')}
The user plays ${input.identityName}: write {user} wherever a Memory refers to them.

# Characters present in this exchange
${input.present.join(', ') || '(none)'}

# Current Memories (id: [known by] text)
${memories}

# LATEST EXCHANGE (extract from this)
${input.identityName}: ${input.userText}

${input.aiText}`;
    return {
        messages: [
            { role: 'system', content: input.overCap ? `${SYSTEM}\n\n${overCapInstruction(input.memories.length)}` : SYSTEM },
            { role: 'user', content: user },
        ],
        maxTokens: input.overCap ? EXTRACTION_OVER_CAP_MAX_TOKENS : EXTRACTION_MAX_TOKENS,
    };
}

/** The extraction's operations, read loosely: every item that is not an object with its fields is dropped. */
export type ExtractedOperation =
    | { op: 'add'; text: string; knownBy: string[]; cause: string }
    | { op: 'update'; id: number; text: string; cause: string }
    | { op: 'known_by'; id: number; names: string[]; cause: string }
    | { op: 'merge'; ids: number[]; text: string; knownBy: string[]; cause: string }
    | { op: 'archive'; id: number; cause: string }
    | { op: 'delete'; id: number; cause: string };

export interface Extraction {
    operations: ExtractedOperation[];
}

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isInteger(value) ? value : /^\d+$/.test(str(value)) ? Number(str(value)) : null;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const names = (value: unknown): string[] => (Array.isArray(value) ? value.map(str).filter((name) => name !== '') : []);
const ids = (value: unknown): number[] => (Array.isArray(value) ? value.flatMap((id) => (num(id) === null ? [] : [num(id)!])) : []);

/** Reads the extraction's JSON. Throws `UnparseableOutputError` when there is no JSON object to read. */
export function parseExtraction(text: string): Extraction {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new UnparseableOutputError('The extraction wrote no JSON object.');
    let json: unknown;
    try {
        json = JSON.parse(match[0]);
    } catch (error) {
        throw new UnparseableOutputError(`The extraction's JSON could not be read: ${(error as Error).message}`);
    }
    if (!isObject(json)) throw new UnparseableOutputError('The extraction wrote no JSON object.');

    const list = Array.isArray(json.operations) ? json.operations : [];
    const operations = list.flatMap((item): ExtractedOperation[] => {
        if (!isObject(item)) return [];
        const cause = str(item.cause);
        const id = num(item.id);
        switch (str(item.op)) {
            case 'add':
                return str(item.text) ? [{ op: 'add', text: str(item.text), knownBy: names(item.known_by), cause }] : [];
            case 'update':
                return id !== null && str(item.text) ? [{ op: 'update', id, text: str(item.text), cause }] : [];
            case 'known_by':
                return id !== null ? [{ op: 'known_by', id, names: names(item.names), cause }] : [];
            case 'merge':
                return str(item.text) ? [{ op: 'merge', ids: ids(item.ids), text: str(item.text), knownBy: names(item.known_by), cause }] : [];
            case 'archive':
                return id !== null ? [{ op: 'archive', id, cause }] : [];
            case 'delete':
                return id !== null ? [{ op: 'delete', id, cause }] : [];
            default:
                return [];
        }
    });
    return { operations };
}

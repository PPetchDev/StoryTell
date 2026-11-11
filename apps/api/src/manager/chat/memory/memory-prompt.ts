import { UnparseableOutputError } from '../../../errors/model-gateway.errors.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { exchangeUserLine } from '../exchange.js';

/**
 * Memory extraction's prompt and output (spec: "Memory extraction"). Pure logic over plain
 * inputs: the manager gathers them. The same Memory lines feed the turn prompt's Memory layer.
 * There is no cap (.scratch/memory-by-meaning/spec.md, "Keeping every Memory"): a Chat keeps every
 * Memory it makes, so the prompt never counts them or demands merges and archives; the model may
 * still choose those when Memories truly repeat.
 */

export interface ExtractionMemory {
    id: number;
    /** With `{user}` as written; the extraction keeps the placeholder. */
    text: string;
    knownBy: string[];
    locked: boolean;
}

/** An active Belief as the extraction sees it (.scratch/memory-by-meaning/spec.md, "Beliefs"). */
export interface ExtractionBelief {
    id: number;
    characterName: string;
    /** With `{user}` as written. */
    text: string;
    /** The Memory it contradicts, by id; null for none. */
    contradicts: number | null;
}

export interface ExtractionPromptInput {
    cast: string[];
    /** The worn identity's name. The extraction writes `{user}` instead. */
    identityName: string;
    present: string[];
    /** Every non-archived Memory, in the stable order. */
    memories: ExtractionMemory[];
    /** The active Beliefs, oldest first. */
    beliefs: ExtractionBelief[];
    /** What the user wrote; null after a Continue, which has no User Message. */
    userText: string | null;
    aiText: string;
}

export const EXTRACTION_MAX_TOKENS = 1_200;

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
- When a Character is told something false, or wrongly concludes something, record it as their Belief. When the story shows them the truth, give the Belief up.
- A Belief is one Character's alone, may be false, and is never a Memory: the truth stays a Memory, known only by those who know it. Name the Memory a Belief contradicts, if any, by its id.

Reply with JSON only, with these operations (any number, in order, empty when nothing changed):
{"operations":[
 {"op":"add","text":"...","known_by":["Name"],"cause":"..."},
 {"op":"update","id":12,"text":"...","cause":"..."},
 {"op":"known_by","id":12,"names":["Name"],"cause":"..."},
 {"op":"merge","ids":[3,7],"text":"...","known_by":["Name"],"cause":"..."},
 {"op":"archive","id":4,"cause":"..."},
 {"op":"delete","id":5,"cause":"..."},
 {"op":"believe","character":"Name","text":"...","contradicts":12,"cause":"..."},
 {"op":"give_up","belief":3,"because":"..."}
]}
"contradicts" is optional. "belief" is the id of an active Belief.
"cause" is the moment in the exchange that justifies the operation, in a few words.`;

/** A Memory as both the extraction prompt and the turn prompt's Memory layer list it. */
export function memoryLine(memory: { text: string; knownBy: string[] }, extra = ''): string {
    const known = memory.knownBy.length > 0 ? `known by ${memory.knownBy.join(', ')}` : 'known by no one';
    return `- [${known}]${extra} ${memory.text}`;
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

# Active Beliefs (id: who believes what)
${input.beliefs.map(beliefLineForExtraction).join('\n') || '(none)'}

# LATEST EXCHANGE (extract from this)
${exchangeUserLine(input.identityName, input.userText)}

${input.aiText}`;
    return {
        messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: user },
        ],
        maxTokens: EXTRACTION_MAX_TOKENS,
    };
}

/** An active Belief as the extraction prompt lists it. */
function beliefLineForExtraction(belief: ExtractionBelief): string {
    return `${belief.id}: ${belief.characterName} believes: ${belief.text}${belief.contradicts === null ? '' : ` (contradicts Memory ${belief.contradicts})`}`;
}

/** The extraction's operations, read loosely: every item that is not an object with its fields is dropped. */
export type ExtractedOperation =
    | { op: 'add'; text: string; knownBy: string[]; cause: string }
    | { op: 'update'; id: number; text: string; cause: string }
    | { op: 'known_by'; id: number; names: string[]; cause: string }
    | { op: 'merge'; ids: number[]; text: string; knownBy: string[]; cause: string }
    | { op: 'archive'; id: number; cause: string }
    | { op: 'delete'; id: number; cause: string }
    | { op: 'believe'; character: string; text: string; contradicts: number | null; cause: string }
    | { op: 'give_up'; belief: number; because: string };

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
            case 'believe':
                return str(item.character) && str(item.text)
                    ? [{ op: 'believe', character: str(item.character), text: str(item.text), contradicts: num(item.contradicts), cause }]
                    : [];
            case 'give_up': {
                const belief = num(item.belief);
                return belief !== null ? [{ op: 'give_up', belief, because: str(item.because) }] : [];
            }
            default:
                return [];
        }
    });
    return { operations };
}

import { DetailKind } from '../../../model/ledger/entities/detail-change.entity.js';
import { placeholderUser, renderUser } from '../memory/render-user.js';

/**
 * Now notes (.scratch/growing-cards/spec.md): what has lastingly changed about each Character in one
 * Chat compared with their card, kept as detail records. The current notes read from the records,
 * what the Judge is asked and how its answer is applied, the user's own edit, and what the Narrator
 * reads. Pure logic over plain inputs: the managers gather them.
 */

/** The longest a note may be, in characters: about three short sentences. */
export const NOW_MAX = 300;

/** What answering about them adds to the judge's token cap. */
export const NOW_EXTRA_TOKENS = 120;

/** A recorded change, oldest first in a list. `messageId` null is the user's own edit; left out, a Judge's. */
export interface NowRecord {
    kind: DetailKind;
    characterId: number | null;
    value: string;
    messageId?: number | null;
}

/** One Character's note as it stands, with `{user}`. */
export interface NowNote {
    characterId: number;
    note: string;
    /** The user wrote it themselves. */
    byUser: boolean;
}

export interface ChatNowNotes {
    /** One per Character with a note, in the order they were last set. */
    notes: NowNote[];
    /** The Characters whose note the user cleared and nothing has set since. */
    clearedByUser: number[];
}

/** The current notes: each Character's newest record; an empty one clears theirs. */
export function currentNowNotes(records: readonly NowRecord[]): ChatNowNotes {
    const notes = new Map<number, NowNote>();
    const cleared = new Set<number>();
    for (const record of records) {
        if (record.kind !== DetailKind.Now || record.characterId === null) continue;
        const byUser = record.messageId === null;
        notes.delete(record.characterId);
        cleared.delete(record.characterId);
        if (record.value !== '') notes.set(record.characterId, { characterId: record.characterId, note: record.value, byUser });
        else if (byUser) cleared.add(record.characterId);
    }
    return { notes: [...notes.values()], clearedByUser: [...cleared] };
}

export interface NowCastMember {
    id: number;
    name: string;
}

/** The notes under each Character's name, in cast order, `{user}` kept; a Character gone from the cast is left out. */
export function castNowNotes(current: ChatNowNotes, cast: readonly NowCastMember[]): Array<{ characterId: number; name: string; note: string }> {
    return cast.flatMap((member) => {
        const note = current.notes.find((entry) => entry.characterId === member.id)?.note;
        return note ? [{ characterId: member.id, name: member.name, note }] : [];
    });
}

export const NOW_RULE =
    'Now rule: "Changed in this Chat" is what has lastingly changed about each Character in this Chat compared with how their card describes them at the start: what they call the user now, what they are to the user or to others now (betrothed, married, lovers, sworn enemies), and lasting changes the story has made to their life (a new home, a title, an injury). Add "now": [{"character": "Name", "note": "..."}] inside "details" for a Character when the latest exchange makes such a lasting change or shows one their note lacks, and for a Character in the latest exchange with "nothing yet" once the story so far shows such a change. Give the whole new note: keep what still holds and drop what the story has undone. Write plain facts in the present tense, at most three short sentences, with {user} for the user ("Calls {user} \'my love\', no longer \'traveller\'. Married to {user} since the night of the summer market."). Never feelings, personality, aims, clothes or the events of a scene, and never directions to anyone. Never what someone saw or did ("witnessed the wedding", "visits often"): that is an event, not a change to them. A Character the story has not lastingly changed gets no note; a new tie to someone (now {user}\'s sister-in-law) is a change. "Cleared by the user": give one only for a change the latest exchange itself makes. Only for the Characters listed above, never for the user\'s own character; leave out every Character whose note still holds.';

/**
 * The Judge's section about the notes: each Character's note as it stands, then the rule and the
 * JSON field, so the system message never changes. Read after the latest exchange.
 */
export function judgeNowSection(current: ChatNowNotes, cast: readonly NowCastMember[]): string {
    const lines = cast.map((member) => {
        const note = current.notes.find((entry) => entry.characterId === member.id)?.note;
        if (note) return `${member.name}: ${note}`;
        return `${member.name}: ${current.clearedByUser.includes(member.id) ? 'cleared by the user' : 'nothing yet'}`;
    });
    return ['# Changed in this Chat', ...(lines.length > 0 ? lines : ['(no Characters)']), NOW_RULE].join('\n');
}

/** What the Judge gave for one Character; a note of "" clears theirs. */
export interface JudgedNow {
    character: string;
    note: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads the notes the Judge gave, read loosely: the rule asks for "now" inside "details", but a
 * top-level "now" means the same and is read too (seen with Goals: .scratch/character-minds/spec.md).
 * A null note clears; anything not a string is left out.
 */
export function readJudgedNow(details: unknown, topLevel: unknown): JudgedNow[] {
    const inside = isObject(details) && Array.isArray(details.now) ? details.now : [];
    const outside = Array.isArray(topLevel) ? topLevel : [];
    return [...inside, ...outside].flatMap((item): JudgedNow[] => {
        if (!isObject(item) || typeof item.character !== 'string' || item.character.trim() === '') return [];
        const note = item.note === null ? '' : typeof item.note === 'string' ? item.note : null;
        return note === null ? [] : [{ character: item.character.trim(), note }];
    });
}

/**
 * One line, no stray spaces, the worn identity's name as `{user}`, and no longer than `NOW_MAX`: cut
 * at the last sentence end that fits, or failing that at a word.
 */
export function tidyNow(text: string, identityName: string): string {
    const line = placeholderUser(text.replace(/\s+/g, ' ').trim(), identityName);
    if (line.length <= NOW_MAX) return line;
    const head = line.slice(0, NOW_MAX);
    const sentenceEnd = Math.max(...['. ', '! ', '? ', '." ', '!" ', '?" ', ".' ", "!' ", "?' "].map((end) => head.lastIndexOf(end) + end.trimEnd().length));
    if (sentenceEnd > NOW_MAX / 3) return head.slice(0, sentenceEnd).trim();
    const word = head.lastIndexOf(' ');
    return (word > 0 ? head.slice(0, word) : head).trim();
}

/** Words that open a sentence telling someone what to do. */
const IMPERATIVE_OPENING = /^(?:make|have|let|write|keep|remember|ensure|avoid|use|show|do not|don't|dont|stop|start|treat|refer|address|call|describe|mention|portray|play|be)\b/i;
/** "Always …" and "Never …" before a bare verb ("Never call him that"); "Never calls him that" is a fact. */
const ALWAYS_NEVER = /^(?:always|never)\s+([a-z']+)/i;
/** Speaking of the storyteller, or of what someone ought to do. */
const STEERING = /\b(?:narrator|the ai|the model|the reply|the replies|should|must|make sure)\b/i;

/**
 * Whether a note reads as an instruction rather than a fact (.scratch/growing-cards/spec.md): a note
 * is what is true, and the Narrator reads it as such; directions belong to the Author's note.
 */
export function readsAsInstruction(note: string): boolean {
    if (STEERING.test(note)) return true;
    return note
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => sentence.replace(/^["'“‘(]+/, '').trim())
        .some((sentence) => {
            if (IMPERATIVE_OPENING.test(sentence)) return true;
            const adverb = ALWAYS_NEVER.exec(sentence);
            return adverb !== null && !/(?:s|ed)$/i.test(adverb[1]);
        });
}

/** A change to record against the judged Message. */
export interface NewNow {
    kind: DetailKind.Now;
    characterId: number;
    value: string;
}

const same = (a: string, b: string): boolean => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * What one judgement changes. A note needs a Character of the cast who is not sitting out, one a
 * Character a turn, and reads as facts; the same as now is not a change. `rejected` says why what
 * the Judge gave was not taken, for the log.
 */
export function applyNow(
    input: { current: ChatNowNotes; cast: readonly NowCastMember[]; sittingOut?: readonly number[]; identityName: string },
    judged: readonly JudgedNow[],
): { changes: NewNow[]; rejected: string[] } {
    const changes: NewNow[] = [];
    const rejected: string[] = [];
    const sittingOut = new Set(input.sittingOut ?? []);
    const noted = new Set<number>();
    for (const entry of judged) {
        const character = input.cast.find((member) => same(member.name, entry.character));
        if (!character) {
            rejected.push(`Now note of ${entry.character}: unknown name`);
            continue;
        }
        if (sittingOut.has(character.id)) {
            rejected.push(`Now note of ${character.name}: sitting out`);
            continue;
        }
        if (noted.has(character.id)) {
            rejected.push(`Now note of ${character.name}: a second one in one turn`);
            continue;
        }
        const value = tidyNow(entry.note, input.identityName);
        if (value !== '' && readsAsInstruction(value)) {
            rejected.push(`Now note of ${character.name}: reads as an instruction — "${value}"`);
            continue;
        }
        const now = input.current.notes.find((note) => note.characterId === character.id)?.note;
        if (value === '' ? now === undefined : now !== undefined && same(now, value)) {
            rejected.push(`Now note of ${character.name}: unchanged`);
            continue;
        }
        noted.add(character.id);
        changes.push({ kind: DetailKind.Now, characterId: character.id, value });
    }
    return { changes, rejected };
}

/** A note as the Narrator reads it: under the Character's name, `{user}` kept for the layer to render. */
export interface PromptNowNote {
    name: string;
    note: string;
}

export const NOW_LAYER_HEADING = '# Changed in this Chat';

/**
 * The Narrator's moment layer: one line per Character with a note, `{user}` rendered as the worn
 * identity. Null with none, so a Chat without notes reads exactly as before.
 */
export function nowLayer(notes: readonly PromptNowNote[] | undefined, identity: string): string | null {
    if (!notes || notes.length === 0) return null;
    return `${NOW_LAYER_HEADING} (what is true of them now in this Chat; where it differs from their card, this holds)
${notes.map((entry) => `- ${entry.name}: ${renderUser(entry.note, identity)}`).join('\n')}`;
}

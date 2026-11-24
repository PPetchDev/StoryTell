import { DetailKind } from '../../../model/ledger/entities/detail-change.entity.js';

/**
 * Pressing notes (.scratch/reply-repair/spec.md, "4. Pressing notes"). In every Chat the prompt
 * eval run played, a Character closed reply after reply pressing the user to ask or say one thing,
 * whatever the user's Message was about (.scratch/prompt-evals/spec.md, 2026-11-23 and 24). A rule
 * in the turn prompt cut it; it did not end it, because a rule about pressing in general does not
 * tell the model which thing it keeps asking for. So the Judge names it, in the call it already
 * makes, and the next turn reads it once: as a slip tells the next turn which fact the last reply
 * got wrong.
 *
 * A note is a detail record of kind `pressing`, recorded against the reply that pressed: its
 * Character is the record's, its value what they pressed for. So a rewind of the reply (Regenerate,
 * an edit, another Reply version) takes the note with it, Reset clears it and a Branch copies it,
 * with no code of their own. A Reply version chosen again is judged again, so its note is the
 * Judge's new answer about it, not a stored one.
 */

export interface PressingNote {
    /** The Character who pressed, by name. */
    character: string;
    /** What they pressed the user for, in a few words ("to say why they really came"). */
    forWhat: string;
}

/** A detail record as far as a pressing note needs it. */
export interface PressingRecord {
    kind: DetailKind;
    characterId: number | null;
    value: string;
    messageId?: number | null;
}

/** The most notes kept for one reply, and the longest "what for". */
export const PRESSING_PER_REPLY = 2;
export const PRESSING_TEXT_MAX = 80;
/** The room the Judge's answer needs for two of them. */
export const PRESSING_EXTRA_TOKENS = 90;
/** What the Story so far trigger reserves for the turn's block at its largest (two notes), which it can't know in advance. */
export const PRESSING_RESERVE_TOKENS = 170;

const text = (value: unknown): string => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');

/** Reads the judgement's `pressing`, loosely: an item without a Character or without what for is left out. */
export function readJudgedPressing(value: unknown): PressingNote[] {
    return (Array.isArray(value) ? value : []).flatMap((item): PressingNote[] => {
        if (typeof item !== 'object' || item === null) return [];
        const { character, for: forWhat } = item as { character?: unknown; for?: unknown };
        return text(character) && text(forWhat) ? [{ character: text(character), forWhat: text(forWhat) }] : [];
    });
}

/**
 * The Judge's section, in its user message after the latest exchange, the same words every call.
 * The JSON field is named in the system message's reply shape too: on DeepSeek V4 Flash a field
 * only the user message asked for did not come back (.scratch/story-quality/spec.md, "Real-model check").
 */
export function judgePressingSection(): string {
    return (
        'Pressing rule: when the latest reply has a Character press the user’s character to ask, say or decide one particular thing, and the user’s message just before it was about something else, ' +
        'add "pressing": [{"character": "...", "for": "..."}] with that Character’s name and, in a few words, what they pressed for ("to say why they really came"). ' +
        'Not pressing: answering what the user asked, teasing, an ordinary question about what the user just said, or an advance made in passing. Leave "pressing" out when there is none.'
    );
}

/**
 * What is recorded of the notes the Judge gave. Dropped: every note when the user sent no Message
 * (a Continue: there was nothing for the reply to press past); a note for someone who is not a
 * Character of the Story, for one sitting out, or for the user's own character; the same note given
 * twice. At most `PRESSING_PER_REPLY` are kept, each cut to `PRESSING_TEXT_MAX` with no full stop
 * at its end. `rejected` says why, for the logs.
 */
export function applyPressing(
    judged: readonly PressingNote[],
    context: { cast: readonly { id: number; name: string }[]; sittingOut: readonly number[]; identityName: string; userSpoke: boolean },
): { changes: Array<{ kind: DetailKind; characterId: number | null; value: string }>; rejected: string[] } {
    const changes: Array<{ kind: DetailKind; characterId: number | null; value: string }> = [];
    const rejected: string[] = [];
    for (const note of judged) {
        const character = context.cast.find((member) => member.name.toLowerCase() === note.character.toLowerCase());
        const forWhat = note.forWhat.slice(0, PRESSING_TEXT_MAX).trim().replace(/[.!?]+$/, '');
        if (!context.userSpoke) rejected.push(`Pressing note for "${note.character}": the user sent no Message this turn`);
        else if (note.character.toLowerCase() === context.identityName.trim().toLowerCase()) rejected.push(`Pressing note for "${note.character}": the user's own character`);
        else if (!character) rejected.push(`Pressing note for "${note.character}": not a Character of the Story`);
        else if (context.sittingOut.includes(character.id)) rejected.push(`Pressing note for "${character.name}": sitting out`);
        else if (forWhat === '') rejected.push(`Pressing note for "${character.name}": nothing pressed for`);
        else if (changes.some((change) => change.characterId === character.id && change.value.toLowerCase() === forWhat.toLowerCase())) rejected.push(`Pressing note for "${character.name}": given twice`);
        else if (changes.length >= PRESSING_PER_REPLY) rejected.push(`Pressing note for "${character.name}": at most ${PRESSING_PER_REPLY} a reply`);
        else changes.push({ kind: DetailKind.Pressing, characterId: character.id, value: forWhat });
    }
    return { changes, rejected };
}

/**
 * The notes recorded against one Message, each named as the Story names its Character now; none
 * for no Message. A note whose Character has left the Story is left out.
 */
export function pressingOf(records: readonly PressingRecord[], messageId: number | null, cast: readonly { id: number; name: string }[]): PressingNote[] {
    if (messageId === null) return [];
    return records
        .filter((record) => record.kind === DetailKind.Pressing && record.messageId === messageId)
        .flatMap((record): PressingNote[] => {
            const character = cast.find((member) => member.id === record.characterId);
            return character ? [{ character: character.name, forWhat: record.value }] : [];
        });
}

/**
 * The turn's block, in its trailing blocks beside the Established facts: who pressed for what in
 * the last reply, and that they do not ask again in this one. Read once: only the newest AI
 * Message's notes reach it. Null with none, and then the prompt is as before.
 */
export function pressingBlock(notes: readonly PressingNote[] | null | undefined, identityName: string): string | null {
    if (!notes || notes.length === 0) return null;
    return notes
        .map(
            (note) =>
                `In the last reply ${note.character} pressed ${identityName} for this: ${note.forWhat}. ` +
                `${identityName} spoke of something else, and that is the answer for now: ${note.character} does not ask for it again in this reply, and lets what they want show in what they do.`,
        )
        .join('\n');
}

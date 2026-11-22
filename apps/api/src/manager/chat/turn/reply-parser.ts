/**
 * The reply parser and the user guard (spec: "Reply parser and user guard"), ported from the
 * turn prototype's `parseSingle`. Pure logic: no entities, no I/O.
 */

export interface CastName {
    id: number;
    name: string;
}

export type ReplyPart =
    | { kind: 'narration'; text: string }
    | { kind: 'speech'; characterId: number | null; speakerName: string; text: string };

export interface ParsedReply {
    parts: ReplyPart[];
    /** Speaker names that matched no Character, for the logs. */
    unknownSpeakers: string[];
    /** True when the reply was cut at a line written as the worn identity. */
    cutAtUserLine: boolean;
    /** The names of Characters sitting out whose speech lines were dropped, for the logs. */
    droppedSpeakers: string[];
}

export interface ParseOptions {
    /** The guard: cut at a line written as the worn identity, and drop lines of Characters sitting out. On by default. */
    guard?: boolean;
    /**
     * The ids of the Characters sitting out (.scratch/speaker-controls/spec.md). With the guard on,
     * their speech lines are dropped with the lines continuing them; narration naming them stays.
     */
    sittingOut?: number[];
}

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A speech line: `@Name:`, optionally wrapped in `*`, then the text. */
const SPEECH_LINE = /^\s*\**@([^:\n*@]{1,60}?)\**\s*:\s*(.*)$/;

/**
 * The guard: a line that speaks as the worn identity or as "You", whether as `Name:`,
 * `@Name:` or `*Name*:`. The reply is cut there.
 */
export function userLinePattern(identityName: string): RegExp {
    const name = identityName.trim();
    const names = name === '' ? 'You' : `${escapeRegExp(name)}|You`;
    return new RegExp(`^\\s*\\**@?(${names})\\**\\s*:`, 'i');
}

/**
 * The Character a speech line names: their whole name in any case, else one word of it when that
 * word belongs to one Character only. A model told to write "@Mira Vance:" often writes "@Mira:"
 * where no earlier line shows it the full name (the prompt eval run, 2026-11-22: 6 of 9 replies);
 * unlinked, the line had no picture, colour or voice. A word two Characters share ("Valmont" of
 * Tamsin and Mireille Valmont) names neither. A name of several words that is no one's whole name
 * goes by its first word, a Character's first name, when only one Character has it.
 */
export function speakerOf<T extends CastName>(cast: T[], spoken: string): T | undefined {
    const name = spoken.trim().toLowerCase();
    const whole = cast.find((member) => member.name.toLowerCase() === name);
    if (whole || name === '') return whole;
    const sharing = cast.filter((member) => member.name.toLowerCase().split(/\s+/).includes(name));
    if (sharing.length === 1) return sharing[0];
    // Two names run together: "Tamsin Varro" for Tamsin Valmont, beside an Ines Varro (GLM-5.3 on live,
    // 2026-11-23). The first name says who it is, when only one Character has it; the rest is the slip.
    const words = name.split(/\s+/);
    if (words.length < 2) return undefined;
    const first = cast.filter((member) => member.name.toLowerCase().split(/\s+/)[0] === words[0]);
    return first.length === 1 ? first[0] : undefined;
}

/**
 * Splits a reply into narration and speech parts:
 * - an `@Name:` line starts a speech part; the name is matched case-insensitively against
 *   the cast, by the whole name or by one word of it that only one Character has (`speakerOf`),
 *   and the canonical name is stamped
 * - a non-blank line directly under a speech line continues that speech
 * - a speech line with no words on it (`@Name:` alone) takes the next paragraph as its words,
 *   blank line or not: GLM-5.3 wrote a whole reply that way (the prompt eval run, 2026-11-22),
 *   and the Character's words were read as narration
 * - after a blank line, text is narration; consecutive narration lines merge
 * - an unknown speaker is kept by name, with no Character link
 * - the reply is cut at the first line written as the worn identity or "You" (the guard;
 *   off for the Opening, which the author wrote, and for an AI Message the user edits)
 * - with the guard on, the speech of a Character sitting out is dropped, with the lines
 *   continuing it; narration that names them stays
 */
export function parseReply(text: string, cast: CastName[], identityName: string, options: ParseOptions = {}): ParsedReply {
    const userLine = userLinePattern(identityName);
    const guard = options.guard ?? true;
    const sittingOut = new Set(guard ? (options.sittingOut ?? []) : []);
    const parts: ReplyPart[] = [];
    const unknownSpeakers: string[] = [];
    const droppedSpeakers: string[] = [];
    let cutAtUserLine = false;
    let afterBlank = true;
    // True from a dropped speech line through the lines right under it, which continue it.
    let dropping = false;
    // True from a speech line with no words on it until its words come: the next paragraph is that speaker's.
    let awaitingWords = false;

    for (const line of text.split('\n')) {
        if (guard && userLine.test(line)) {
            cutAtUserLine = true;
            break;
        }
        const speech = line.match(SPEECH_LINE);
        if (dropping && !speech && line.trim()) {
            awaitingWords = false;
            continue;
        }
        // A blank line ends what is dropped, unless the dropped name stood alone and its words are still to come.
        if (speech || !awaitingWords) dropping = false;
        const last = parts[parts.length - 1];
        if (speech) {
            const spoken = speech[1].trim();
            const character = speakerOf(cast, spoken);
            awaitingWords = speech[2].trim() === '';
            if (!character) unknownSpeakers.push(spoken);
            if (character && sittingOut.has(character.id)) {
                if (!droppedSpeakers.includes(character.name)) droppedSpeakers.push(character.name);
                dropping = true;
                afterBlank = false;
                continue;
            }
            parts.push({
                kind: 'speech',
                characterId: character?.id ?? null,
                speakerName: character?.name ?? spoken,
                text: speech[2],
            });
        } else if (line.trim()) {
            // The words of a name that stood alone; else a line right under a speech line continues it, and after a blank line it's narration.
            if (awaitingWords && last?.kind === 'speech') {
                last.text = line;
                awaitingWords = false;
            } else if (last && (last.kind === 'narration' || !afterBlank)) {
                last.text += (afterBlank ? '\n\n' : '\n') + line;
            } else {
                parts.push({ kind: 'narration', text: line });
            }
        }
        afterBlank = !line.trim();
    }

    for (const part of parts) part.text = part.text.trim();
    return { parts: withQuotedSpeechSplit(parts.filter((part) => part.text !== '')), unknownSpeakers, cutAtUserLine, droppedSpeakers };
}

/** A piece of a speech line written as prose: the words said, or the narration between them. */
export interface QuotedPiece {
    kind: 'speech' | 'narration';
    text: string;
}

/** A speech line written as prose opens with a quotation mark. */
const OPENS_QUOTED = /^\s*["“]/;

/** A narration piece needs a letter: punctuation or a dash between two quotes is nothing to show. */
const HAS_LETTER = /\p{L}/u;

/**
 * A speech line written as prose, the way a novel writes dialogue (.scratch/quoted-speech/spec.md):
 * `"Going, going." She leans on the post. "Sleep well."`. Seen on live (2026-11-20): GLM-5.3 wrote
 * 49 of a Chat's 110 speech lines this way, so the action showed in the speech bubble and was read
 * aloud in the Character's voice. The quoted words are speech, quotes taken off; the text between
 * them is narration. Only a line that opens with a quotation mark is split, so a line that merely
 * quotes someone ("She told me, "Wear them."") stays as written. And every piece between the quotes
 * must read as narration about someone (`She leans…`, `A grin.`, `Ines turns.`): on live a Character
 * also opens by echoing your words and goes on talking (`"Can't give you both." Listen to you…`), and
 * that line stays as written. Null when there is nothing to split.
 */
export function splitQuotedSpeech(text: string, speakerName = ''): QuotedPiece[] | null {
    if (!OPENS_QUOTED.test(text)) return null;
    const pieces: QuotedPiece[] = [];
    let allNarration = true;
    const push = (kind: QuotedPiece['kind'], raw: string): void => {
        let piece = raw.trim();
        if (piece === '' || (kind === 'narration' && !HAS_LETTER.test(piece))) return;
        if (kind === 'narration' && !readsAsNarration(piece, speakerName)) allNarration = false;
        // `"Going, going," she says, "…"`: each piece stands on its own once apart.
        piece = piece.replace(/[,;:]$/, '.');
        if (kind === 'narration') piece = piece.charAt(0).toUpperCase() + piece.slice(1);
        const last = pieces[pieces.length - 1];
        if (last?.kind === kind) last.text += ' ' + piece;
        else pieces.push({ kind, text: piece });
    };
    let inside = false;
    let current = '';
    for (const char of text) {
        // “ always opens and ” always closes; a straight quote does whichever is due.
        const opens = char === '“' || (char === '"' && !inside);
        const closes = char === '”' || (char === '"' && inside);
        if (opens && !inside) {
            push('narration', current);
            current = '';
            inside = true;
        } else if (closes && inside) {
            push('speech', current);
            current = '';
            inside = false;
        } else {
            current += char;
        }
    }
    // An unclosed quote (a line still streaming, or a model's slip) is speech to its end.
    push(inside ? 'speech' : 'narration', current);
    return pieces.length > 0 && allNarration ? pieces : null;
}

/** The words narration about the speaker opens with: `She leans…`, `A grin, sharp and bright.`, `Another pause.` */
const NARRATION_OPENERS = new Set(['she', 'he', 'they', 'her', 'his', 'their', 'it', 'its', 'a', 'an', 'the', 'another']);

/**
 * Whether text between two quotes reads as narration: it opens with a word from
 * NARRATION_OPENERS or a word of the speaker's name. Text that opens with punctuation
 * (`"IT'S HUGE"! He said…`) or with the Character's own words (`Listen to you.`) does not.
 */
function readsAsNarration(piece: string, speakerName: string): boolean {
    const first = (piece.match(/^\p{L}+/u)?.[0] ?? '').toLowerCase();
    if (first === '') return false;
    return NARRATION_OPENERS.has(first) || speakerName.toLowerCase().split(/\s+/).includes(first);
}

/** The parts with each prose speech line split into speech and narration; narration that ends up side by side merges, as the parser merges it. */
function withQuotedSpeechSplit(parts: ReplyPart[]): ReplyPart[] {
    const split: ReplyPart[] = [];
    for (const part of parts) {
        const pieces = part.kind === 'speech' ? splitQuotedSpeech(part.text, part.speakerName) : null;
        const expanded: ReplyPart[] = pieces ? pieces.map((piece) => (piece.kind === 'speech' ? { ...part, text: piece.text } : { kind: 'narration', text: piece.text })) : [part];
        for (const each of expanded) {
            const last = split[split.length - 1];
            if (each.kind === 'narration' && last?.kind === 'narration') last.text += '\n\n' + each.text;
            else split.push(each);
        }
    }
    return split;
}

/** The `@Name:` text of a parsed Message, as the editor (ticket 25) and the prompt show it. */
export function partsToText(parts: ReplyPart[]): string {
    return parts
        .map((part) => (part.kind === 'speech' ? `@${part.speakerName}: ${part.text}` : part.text))
        .join('\n\n');
}

/**
 * A speech line's spoken words only: *asterisk asides* and (parenthesised directions) taken out.
 * For the history a prompt reads, never for what is kept or shown (.scratch/natural-speech/spec.md):
 * replies that put stage directions inside speech taught the model to keep doing it, whatever the
 * rules said, so earlier replies reach it as clean examples.
 */
export function spokenOnly(text: string): string {
    return text
        .replace(/\*[^*\n]+\*/g, ' ')
        .replace(/\([^()\n]*\)/g, ' ')
        .replace(/[ \t]+([,.!?;:…])/g, '$1')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

/**
 * A reply as the history of a prompt reads it: `partsToText`, with each speech line's words only; a
 * line left with none is dropped. Replies stored before prose speech lines were split reach it split
 * (.scratch/quoted-speech/spec.md), so they don't teach the model the habit.
 */
export function historyPartsText(parts: ReplyPart[]): string {
    return partsToText(
        withQuotedSpeechSplit(parts.map((part) => ({ ...part }))).flatMap((part): ReplyPart[] => {
            if (part.kind !== 'speech') return [part];
            const text = spokenOnly(part.text);
            return text === '' ? [] : [{ ...part, text }];
        }),
    );
}

/** What of a reply still being written may be shown (spec: "The guard while streaming"). */
export interface ReleasedText {
    /** The longest start of the reply that can't turn into a line written as the worn identity. */
    text: string;
    /** True once a line written as the worn identity has begun: the reply ends before it. */
    userLine: boolean;
}

/**
 * The guard for a reply that is still arriving. Complete lines are released up to the first
 * line written as the worn identity, where the reply ends. The unfinished last line is held
 * back while it could still become one (`Name:`, `@Name:`, `*Name*:` or `You:`), and while it
 * could still become an `@Name:` speech line, so a bubble never shows first as narration.
 */
export function releasedText(text: string, identityName: string): ReleasedText {
    const userLine = userLinePattern(identityName);
    const name = identityName.trim();
    const names = (name === '' ? ['You'] : [name, 'You']).map((each) => each.toLowerCase());
    for (let start = 0; ; ) {
        const end = text.indexOf('\n', start);
        const line = end < 0 ? text.slice(start) : text.slice(start, end);
        if (userLine.test(line)) return { text: text.slice(0, start), userLine: true };
        if (end < 0) {
            const hold = couldBecomeUserLine(line, names) || SPEECH_LINE_START.test(line);
            return { text: hold ? text.slice(0, start) : text, userLine: false };
        }
        start = end + 1;
    }
}

/** The start of an `@Name:` line whose colon hasn't arrived yet. */
const SPEECH_LINE_START = /^\s*\**@[^:\n@]{0,64}$/;

/** Whether more text could still make `line` match `userLinePattern`: `\s* \** @? name \** \s* :`. */
function couldBecomeUserLine(line: string, names: string[]): boolean {
    let at = 0;
    while (at < line.length && /\s/.test(line[at])) at++;
    while (at < line.length && line[at] === '*') at++;
    if (line[at] === '@') at++;
    const rest = line.slice(at).toLowerCase();
    return names.some((name) => {
        if (name.startsWith(rest)) return true;
        if (!rest.startsWith(name)) return false;
        let after = name.length;
        while (after < rest.length && rest[after] === '*') after++;
        while (after < rest.length && /\s/.test(rest[after])) after++;
        return after === rest.length;
    });
}

/** A text compared loosely: no asterisks or quotes, spaces collapsed, lower case. */
const loosely = (text: string): string =>
    text
        .replace(/[*"“”]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

/**
 * The reply without the user's own message said back as its opening narration (seen on live
 * 2026-11-17: a reply began with the user's whole message, word for word, then went on). Only an
 * opening paragraph that is the user's message, read loosely, goes; a reply that merely starts
 * the same way stays. With no user message (Continue, Epilogue), the parts as they are.
 */
export function withoutEchoedUserText(parts: ReplyPart[], userText: string | null): { parts: ReplyPart[]; echoed: boolean } {
    const first = parts[0];
    if (userText === null || first?.kind !== 'narration' || loosely(userText) === '') return { parts, echoed: false };
    const paragraphs = first.text.split(/\n\s*\n/);
    if (loosely(paragraphs[0]) !== loosely(userText)) return { parts, echoed: false };
    const rest = paragraphs.slice(1).join('\n\n').trim();
    return { parts: rest === '' ? parts.slice(1) : [{ kind: 'narration', text: rest }, ...parts.slice(1)], echoed: true };
}

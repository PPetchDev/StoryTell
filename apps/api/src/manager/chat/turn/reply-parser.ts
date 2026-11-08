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
 * Splits a reply into narration and speech parts:
 * - an `@Name:` line starts a speech part; the name is matched case-insensitively against
 *   the cast and the canonical name is stamped
 * - a non-blank line directly under a speech line continues that speech
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

    for (const line of text.split('\n')) {
        if (guard && userLine.test(line)) {
            cutAtUserLine = true;
            break;
        }
        const speech = line.match(SPEECH_LINE);
        if (dropping && !speech && line.trim()) continue;
        dropping = false;
        const last = parts[parts.length - 1];
        if (speech) {
            const spoken = speech[1].trim();
            const character = cast.find((member) => member.name.toLowerCase() === spoken.toLowerCase());
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
            // A line right under a speech line continues it; after a blank line it's narration.
            if (last && (last.kind === 'narration' || !afterBlank)) {
                last.text += (afterBlank ? '\n\n' : '\n') + line;
            } else {
                parts.push({ kind: 'narration', text: line });
            }
        }
        afterBlank = !line.trim();
    }

    for (const part of parts) part.text = part.text.trim();
    return { parts: parts.filter((part) => part.text !== ''), unknownSpeakers, cutAtUserLine, droppedSpeakers };
}

/** The `@Name:` text of a parsed Message, as the editor (ticket 25) and the prompt show it. */
export function partsToText(parts: ReplyPart[]): string {
    return parts
        .map((part) => (part.kind === 'speech' ? `@${part.speakerName}: ${part.text}` : part.text))
        .join('\n\n');
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

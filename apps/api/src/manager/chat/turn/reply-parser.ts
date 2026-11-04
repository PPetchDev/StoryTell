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
 *   off for the Opening, which the author wrote)
 */
export function parseReply(
    text: string,
    cast: CastName[],
    identityName: string,
    options: { guard?: boolean } = {},
): ParsedReply {
    const userLine = userLinePattern(identityName);
    const guard = options.guard ?? true;
    const parts: ReplyPart[] = [];
    const unknownSpeakers: string[] = [];
    let cutAtUserLine = false;
    let afterBlank = true;

    for (const line of text.split('\n')) {
        if (guard && userLine.test(line)) {
            cutAtUserLine = true;
            break;
        }
        const speech = line.match(SPEECH_LINE);
        const last = parts[parts.length - 1];
        if (speech) {
            const spoken = speech[1].trim();
            const character = cast.find((member) => member.name.toLowerCase() === spoken.toLowerCase());
            if (!character) unknownSpeakers.push(spoken);
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
    return { parts: parts.filter((part) => part.text !== ''), unknownSpeakers, cutAtUserLine };
}

/** The `@Name:` text of a parsed Message, as the editor (ticket 25) and the prompt show it. */
export function partsToText(parts: ReplyPart[]): string {
    return parts
        .map((part) => (part.kind === 'speech' ? `@${part.speakerName}: ${part.text}` : part.text))
        .join('\n\n');
}

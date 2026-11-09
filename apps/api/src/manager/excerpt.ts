/** How long a Story card's hook may get before it is cut. */
const HOOK_LENGTH = 120;
/** How long a Chat's latest line may get in the Chat list before it is cut. */
const LATEST_LINE_LENGTH = 100;

/** Titles whose full stop does not end a sentence. */
const TITLES = new Set(['mr', 'mrs', 'ms', 'mx', 'dr', 'st', 'mt', 'prof', 'capt', 'col', 'gen', 'lt', 'sgt', 'rev', 'fr', 'sr', 'jr']);

/**
 * Collapses whitespace and cuts the text to at most `max` characters, at a word break where
 * there is one, ending with an ellipsis when anything was cut.
 */
function clip(text: string, max: number): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= max) return flat;
    const cut = flat.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(' ');
    const atWord = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut;
    return `${atWord.replace(/[\s,;:.!?-]+$/, '')}…`;
}

/** The text up to its first sentence end: an end mark (and any closing quote) before a space or the end. */
function firstSentence(text: string): string {
    for (const end of text.matchAll(/[.!?…]["'”’)]*(?=\s|$)/g)) {
        const before = text.slice(0, end.index);
        const word = before.match(/(\S+)$/)?.[1].toLowerCase();
        if (end[0].startsWith('.') && word && TITLES.has(word)) continue;
        return text.slice(0, end.index + end[0].length);
    }
    return text;
}

/** A Story card's hook: the Setting's first sentence, cut to about 120 characters. */
export function storyHook(setting: string): string {
    return clip(firstSentence(setting.replace(/\s+/g, ' ').trim()), HOOK_LENGTH);
}

/**
 * A Message as one plain line for the Chat list: a User Message without its `*action*`
 * marks, or an AI Message's narration as it is and its speech after the speaker's name;
 * cut to about 100 characters.
 */
export function latestLine(
    message: { text: string | null; parts: Array<{ speakerName: string | null; text: string }> } | undefined,
): string {
    if (!message) return '';
    const text =
        message.text !== null
            ? message.text.replace(/\*/g, '')
            : message.parts.map((part) => (part.speakerName ? `${part.speakerName}: ${part.text}` : part.text)).join(' ');
    return clip(text, LATEST_LINE_LENGTH);
}

/** How long a Document passage's excerpt in Documents in play may get before it is cut. */
const PASSAGE_EXCERPT_LENGTH = 160;

/** A Document passage as Documents in play shows it: its first ~160 characters, whitespace collapsed. */
export function passageExcerpt(text: string): string {
    return clip(text, PASSAGE_EXCERPT_LENGTH);
}

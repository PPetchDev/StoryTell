/** How long a Story card's hook may get before it is cut. */
export const HOOK_LENGTH = 120;
/** How long a Chat's latest line may get in the Chat list before it is cut. */
export const LATEST_LINE_LENGTH = 100;

/**
 * Collapses whitespace and cuts the text to at most `max` characters, at a word break where
 * there is one, ending with an ellipsis when anything was cut.
 */
export function clip(text: string, max: number): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    if (flat.length <= max) return flat;
    const cut = flat.slice(0, max - 1);
    const lastSpace = cut.lastIndexOf(' ');
    const atWord = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut;
    return `${atWord.replace(/[\s,;:.!?-]+$/, '')}…`;
}

/**
 * A Message as one plain line for the Chat list: narration as it is, speech after its
 * speaker's name, and the user's `*action*` marks dropped; cut to about 100 characters.
 */
export function latestLine(
    message: { text: string | null; parts: Array<{ speakerName: string | null; text: string }> } | undefined,
): string {
    if (!message) return '';
    const text =
        message.text ??
        message.parts.map((part) => (part.speakerName ? `${part.speakerName}: ${part.text}` : part.text)).join(' ');
    return clip(text.replace(/\*/g, ''), LATEST_LINE_LENGTH);
}

/** A Story card's hook: the Setting's first sentence, cut to about 120 characters. */
export function storyHook(setting: string): string {
    const flat = setting.replace(/\s+/g, ' ').trim();
    // Up to the first end mark that is followed by a space or the end, keeping a closing quote.
    const sentence = flat.match(/^.*?[.!?…]["'”’)]*(?=\s|$)/)?.[0] ?? flat;
    return clip(sentence, HOOK_LENGTH);
}

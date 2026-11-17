import { DOCUMENTS_HEADING } from '../../src/manager/document/document-search.js';
import { LORE_HEADING } from '../../src/manager/chat/lore/lore-select.js';
import { NARRATOR_NOTES, PROMPT_LAYERS } from '../../src/manager/chat/turn/prompt.js';

type Prompt = { messages: ReadonlyArray<{ role: string; content: string }> };

/** The blocks after the moment layers open with one of these: Lore, Documents, Author's note, then the turn's reminder or the one-off instruction. */
const TRAILING_STARTS = [`${LORE_HEADING} (`, DOCUMENTS_HEADING, "# Author's note", 'Where things stand:', 'Step outside the story'];

/**
 * A prompt's closing user message in its three parts (.scratch/prompt-cache/spec.md): the user's
 * own words (or the Continue/Epilogue instruction; empty for Suggested replies and Write for me),
 * the moment layers (Scene to Inner life), and the blocks after them (Lore, Documents, Author's
 * note, Where things stand … the final instruction, or the one-off instruction).
 */
export function closingParts(request: Prompt): { userText: string; moment: string; trailing: string } {
    const content = request.messages.at(-1)!.content;
    const notesAt = content.indexOf(NARRATOR_NOTES);
    const userText = notesAt >= 0 ? content.slice(0, notesAt).replace(/\n+$/, '') : '';
    const momentAt = content.indexOf(PROMPT_LAYERS.scene);
    const from = momentAt >= 0 ? momentAt : 0;
    const starts = TRAILING_STARTS.map((start) => (content.startsWith(start, from) ? from : content.indexOf(`\n\n${start}`, from) + 2)).filter((at) => at >= 2 || at === from);
    const trailingAt = starts.length > 0 ? Math.min(...starts) : content.length;
    return {
        userText,
        moment: momentAt >= 0 ? content.slice(momentAt, trailingAt).replace(/\n+$/, '') : '',
        trailing: content.slice(trailingAt),
    };
}

/** The blocks after the moment layers, ending on the final instruction: what the trailing system message used to hold. */
export const trailingOf = (request: Prompt): string => closingParts(request).trailing;

/**
 * Every layer a prompt sends, as one text: the standing ones in its first system message, then
 * the moment ones from its closing message. For a test that reads a layer wherever it now sits.
 */
export function layersOf(request: Prompt): string {
    if (request.messages.length < 2) return request.messages[0].content;
    const { moment } = closingParts(request);
    return moment ? `${request.messages[0].content}\n\n${moment}` : request.messages[0].content;
}

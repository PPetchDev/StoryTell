import { apiSend } from './api';
import type { Story } from './story';

// Mirrors the API's Saved reply DTOs (apps/api/src/api/saved-reply/dto/saved-reply.response.dto.ts).

export interface SavedReply {
    id: number;
    text: string;
}

/** A line of the composer's tray: this Story's own (`story`), or for all Stories (`app`). */
export interface TraySavedReply extends SavedReply {
    scope: 'story' | 'app';
}

export interface SavedReplyList {
    savedReplies: SavedReply[];
}

/** Where a list of Saved replies is saved: each write answers the scope's whole list, in add order. */
export interface SavedReplyStore {
    add(text: string): Promise<SavedReply[]>;
    update(id: number, text: string): Promise<SavedReply[]>;
    remove(id: number): Promise<SavedReply[]>;
}

const list = (answer: SavedReplyList) => answer.savedReplies;

/** The app-wide list is read with useApiQuery('/saved-replies'). */
export const appSavedReplies: SavedReplyStore = {
    add: (text) => apiSend<SavedReplyList>('POST', '/saved-replies', { text }).then(list),
    update: (id, text) => apiSend<SavedReplyList>('PATCH', `/saved-replies/${id}`, { text }).then(list),
    remove: (id) => apiSend<SavedReplyList>('DELETE', `/saved-replies/${id}`).then(list),
};

/** A Story's own: each write answers the whole Story, handed to `onStory` before its list is taken. */
export function storySavedReplies(storyId: number, onStory: (story: Story) => void = () => {}): SavedReplyStore {
    const lines = (story: Story) => {
        onStory(story);
        return story.savedReplies;
    };
    return {
        add: (text) => apiSend<Story>('POST', `/stories/${storyId}/saved-replies`, { text }).then(lines),
        update: (id, text) => apiSend<Story>('PATCH', `/stories/${storyId}/saved-replies/${id}`, { text }).then(lines),
        remove: (id) => apiSend<Story>('DELETE', `/stories/${storyId}/saved-replies/${id}`).then(lines),
    };
}

/**
 * A Saved reply put into the box (spec: "Composer"): `{user}` (exact, case-sensitive) becomes the
 * worn identity's name, and the line replaces the selection, or goes in at the caret. One space
 * is added on a side whose neighbouring character isn't whitespace; the caret goes after it all.
 */
export function insertSavedReply(
    draft: string,
    line: string,
    identityName: string,
    selection: { start: number; end: number },
): { next: string; caret: number } {
    const filled = line.split('{user}').join(identityName);
    const before = draft.slice(0, selection.start);
    const after = draft.slice(selection.end);
    const lead = before !== '' && !/\s$/.test(before) ? ' ' : '';
    const trail = after !== '' && !/^\s/.test(after) ? ' ' : '';
    const inserted = `${lead}${filled}${trail}`;
    return { next: `${before}${inserted}${after}`, caret: before.length + inserted.length };
}

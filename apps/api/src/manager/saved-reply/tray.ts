import type { SavedReplyEntity, SavedReplyResponse } from '../../model/saved-reply/entities/saved-reply.entity.js';

/** A line of the composer's tray (.scratch/saved-replies-and-replace-rules/spec.md: "Chat detail"). */
export interface TraySavedReply extends SavedReplyResponse {
    scope: 'story' | 'app';
}

/** The tray's lines, in tray order: the Story's own, then the app-wide ones, each in add order. */
export function trayLines(storyLines: SavedReplyEntity[], appLines: SavedReplyEntity[]): TraySavedReply[] {
    return [
        ...storyLines.map((line) => ({ ...line.toResponse(), scope: 'story' as const })),
        ...appLines.map((line) => ({ ...line.toResponse(), scope: 'app' as const })),
    ];
}

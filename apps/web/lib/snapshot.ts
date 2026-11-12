import { apiSend } from './api';

// Mirrors the API's Snapshot response DTOs (apps/api/src/api/snapshot/dto/snapshot.response.dto.ts).

export interface SnapshotCharacter {
    /** Null once the Character is removed from the Story; the stamped name stays. */
    characterId: number | null;
    name: string;
}

export interface Snapshot {
    id: number;
    storyId: number;
    /** Null once the Chat is deleted. */
    chatId: number | null;
    /** Null once an edit, a reset or a Chat delete took the Message away. */
    messageId: number | null;
    imagePath: string;
    /** The prompt the image model was given. */
    prompt: string;
    hint: string;
    imageModel: string;
    costUsd: number;
    characters: SnapshotCharacter[];
    createdAt: string;
}

export interface GalleryItem extends Snapshot {
    /** Null once the Chat is deleted. */
    chatTitle: string | null;
}

/** A Snapshot being made, or one that failed and waits for Retry. A job that succeeded is gone. */
export interface SnapshotJob {
    id: string;
    chatId: number;
    messageId: number;
    hint: string;
    status: 'pending' | 'failed';
    error: { code: string; message: string } | null;
    startedAt: string;
}

/**
 * A written Snapshot prompt, read and edited before it is drawn (.scratch/snapshot-prompt-review/spec.md).
 * The API holds one per Chat until it is drawn, replaced, an hour old, or the API restarts.
 */
export interface SnapshotPrompt {
    id: string;
    chatId: number;
    messageId: number;
    hint: string;
    /** What the writer wrote: the part the user may edit. */
    text: string;
    /** Who is in frame, in frame order. */
    inFrame: { characterId: number; name: string }[];
    /** The whole prompt the image model would be given: `text` with the fixed rules around it. */
    imagePrompt: string;
}

/** The whole image prompt with the user's edit in place of what the writer wrote. */
export function withEditedText(prompt: SnapshotPrompt, text: string): string {
    return prompt.imagePrompt.replace(prompt.text, () => text.trim());
}

export interface ChatSnapshots {
    /** Under a Message of the Chat, oldest first. */
    snapshots: Snapshot[];
    jobs: SnapshotJob[];
}

/** The Snapshots under the given Messages, in thread order: the list the Chat's viewer swipes through. */
export function inThreadOrder(messages: { id: number }[], snapshots: Snapshot[]): Snapshot[] {
    return messages.flatMap((message) => snapshots.filter((snapshot) => snapshot.messageId === message.id));
}

/** Where the API serves a Snapshot's image. */
export function snapshotImageUrl(snapshot: Snapshot): string {
    return `/api/images/${snapshot.imagePath}`;
}

/**
 * A small WebP copy for a grid tile (audit H33): 320px wide, or 640 for a dense screen. The API
 * makes it once and the browser keeps it, as it keeps the full image.
 */
export function snapshotThumbUrl(snapshot: Snapshot, width: 320 | 640 = 320): string {
    return `${snapshotImageUrl(snapshot)}?w=${width}`;
}

/** Where the API serves a Snapshot as a download. */
export function snapshotDownloadUrl(snapshot: Snapshot): string {
    return `/api/stories/${snapshot.storyId}/snapshots/${snapshot.id}/download`;
}

export function chatSnapshotsPath(storyId: number, chatId: number): string {
    return `/stories/${storyId}/chats/${chatId}/snapshots`;
}

export function galleryPath(storyId: number, chatId: number | null): string {
    return `/stories/${storyId}/gallery${chatId === null ? '' : `?chatId=${chatId}`}`;
}

/** Spec: story 121. */
export const EARLIER_VERSION = 'From an earlier version of this Chat';

export const snapshotApi = {
    /** Writes the Snapshot prompt of the latest AI Message, or of `messageId` for a retake; nothing is drawn. */
    writePrompt: (storyId: number, chatId: number, hint: string, messageId?: number) =>
        apiSend<SnapshotPrompt>('POST', `/stories/${storyId}/chats/${chatId}/snapshot-prompts`, { hint, messageId }),
    /** Draws a written Snapshot prompt with the user's text. Answers with its job at once. */
    draw: (storyId: number, chatId: number, promptId: string, text: string) =>
        apiSend<SnapshotJob>('POST', chatSnapshotsPath(storyId, chatId), { promptId, text }),
    retry: (storyId: number, chatId: number, jobId: string) =>
        apiSend<SnapshotJob>('POST', `/stories/${storyId}/chats/${chatId}/snapshot-jobs/${jobId}/retry`),
    dismiss: (storyId: number, chatId: number, jobId: string) =>
        apiSend<void>('DELETE', `/stories/${storyId}/chats/${chatId}/snapshot-jobs/${jobId}`),
    /** Removes the record and its file, from the timeline and the Gallery. */
    remove: (storyId: number, snapshotId: number) => apiSend<void>('DELETE', `/stories/${storyId}/snapshots/${snapshotId}`),
};

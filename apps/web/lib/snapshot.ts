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

export interface ChatSnapshots {
    /** Under a Message of the Chat, oldest first. */
    snapshots: Snapshot[];
    jobs: SnapshotJob[];
}

/** Where the API serves a Snapshot's image. */
export function snapshotImageUrl(snapshot: Snapshot): string {
    return `/api/images/${snapshot.imagePath}`;
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
    /** One Snapshot of the latest AI Message, or of `messageId` for a retake. Answers with its job at once. */
    take: (storyId: number, chatId: number, hint: string, messageId?: number) =>
        apiSend<SnapshotJob>('POST', chatSnapshotsPath(storyId, chatId), { hint, messageId }),
    retry: (storyId: number, chatId: number, jobId: string) =>
        apiSend<SnapshotJob>('POST', `/stories/${storyId}/chats/${chatId}/snapshot-jobs/${jobId}/retry`),
    dismiss: (storyId: number, chatId: number, jobId: string) =>
        apiSend<void>('DELETE', `/stories/${storyId}/chats/${chatId}/snapshot-jobs/${jobId}`),
    /** Removes the record and its file, from the timeline and the Gallery. */
    remove: (storyId: number, snapshotId: number) => apiSend<void>('DELETE', `/stories/${storyId}/snapshots/${snapshotId}`),
};

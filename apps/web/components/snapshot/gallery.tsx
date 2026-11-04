'use client';

import { useCallback, useEffect, useState } from 'react';

import { useConnection } from '@/components/connection';
import { SnapshotViewer, snapshotAlt } from '@/components/snapshot/snapshot-viewer';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { ChatSummary } from '@/lib/chat';
import { EARLIER_VERSION, GalleryItem, galleryPath, snapshotApi, snapshotImageUrl } from '@/lib/snapshot';

interface GalleryProps {
    storyId: number;
    chats: ChatSummary[];
    /** The Chat the Gallery opens filtered to; null for every Chat. */
    initialChatId: number | null;
}

/**
 * Every Snapshot of the Story, newest first, as a grid (spec: "Gallery"). Filter by Chat; a
 * tap opens one full screen with its prompt, download and delete. An item whose Message is
 * gone is marked as from an earlier version of its Chat; one whose Message is still there
 * jumps to it from the full-screen view.
 */
export function Gallery({ storyId, chats, initialChatId }: GalleryProps) {
    const { reportUnreachable } = useConnection();
    const [chatId, setChatId] = useState<number | null>(initialChatId);
    const [items, setItems] = useState<GalleryItem[] | null>(null);
    const [viewing, setViewing] = useState<GalleryItem | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setItems((await apiFetch<{ snapshots: GalleryItem[] }>(galleryPath(storyId, chatId))).snapshots);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : 'The Gallery could not be read.');
        }
    }, [storyId, chatId, reportUnreachable]);

    useEffect(() => {
        void load();
    }, [load]);

    const remove = async (item: GalleryItem) => {
        setViewing(null);
        setError(null);
        try {
            await snapshotApi.remove(storyId, item.id);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) {
                reportUnreachable();
                return;
            }
            setError(caught instanceof ApiError ? caught.message : 'The Snapshot could not be deleted.');
        }
        await load();
    };

    return (
        <>
            <label className="gallery-filter">
                <span className="muted">Chat</span>
                <select
                    aria-label="Filter by Chat"
                    value={chatId ?? ''}
                    onChange={(event) => setChatId(event.target.value === '' ? null : Number(event.target.value))}
                >
                    <option value="">All Chats</option>
                    {chats.map((chat) => (
                        <option key={chat.id} value={chat.id}>
                            {chat.title}
                        </option>
                    ))}
                </select>
            </label>
            {error && <p role="alert">{error}</p>}
            {items === null ? (
                <p className="muted">Loading…</p>
            ) : items.length === 0 ? (
                <p className="muted">No Snapshots yet. Take one with the camera in a Chat.</p>
            ) : (
                <ul className="gallery-grid" aria-label="Gallery">
                    {items.map((item) => (
                        <li key={item.id}>
                            <button type="button" className="snapshot-thumb" onClick={() => setViewing(item)}>
                                {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
                                <img src={snapshotImageUrl(item)} alt={snapshotAlt(item)} />
                            </button>
                            <span className="muted small">{item.chatTitle ?? 'A deleted Chat'}</span>
                            {item.messageId === null && <span className="gallery-earlier small">{EARLIER_VERSION}</span>}
                        </li>
                    ))}
                </ul>
            )}
            {viewing && (
                <SnapshotViewer snapshot={viewing} showLink onClose={() => setViewing(null)} onDelete={() => void remove(viewing)} />
            )}
        </>
    );
}

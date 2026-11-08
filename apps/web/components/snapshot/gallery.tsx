'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { FoldTitle } from '@/components/fold/fold-button';
import { SnapshotViewer, snapshotAlt } from '@/components/snapshot/snapshot-viewer';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { setFolded, useFolded } from '@/lib/folds';
import { EARLIER_VERSION, GalleryItem, galleryPath, snapshotApi, snapshotImageUrl } from '@/lib/snapshot';
import { coverBackground } from '@/lib/home';
import { StorySummary, storyTitle } from '@/lib/story';

import styles from './gallery.module.css';

export interface GalleryStory {
    id: number;
    title: string;
    /** Its Cover as Home draws it; absent where the Story heading isn't shown. */
    coverImagePath?: StorySummary['coverImagePath'];
    coverFocus?: StorySummary['coverFocus'];
}

interface GalleryProps {
    /** The Stories it shows: one on a Story's Gallery, every Story on the main Gallery. */
    stories: GalleryStory[];
    /** Group by Story first (the main Gallery), even when there is only one. */
    byStory?: boolean;
    /** A Chat to open on: unfolded and scrolled to. */
    initialChatId?: number | null;
}

/** One Chat's Snapshots, newest first; `chatId` is null for the Chats that were deleted. */
interface ChatGroup {
    key: string;
    chatId: number | null;
    title: string;
    items: GalleryItem[];
}

interface StoryGroup {
    storyId: number;
    title: string;
    /** The Cover's CSS background: the picture at its focus point, or the Story's gradient. */
    cover: string;
    count: number;
    chats: ChatGroup[];
}

/** Newest first, across Stories too. */
const newestFirst = (a: GalleryItem, b: GalleryItem) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id;

/** Story, then Chat, each in the order of its newest Snapshot. */
function group(items: GalleryItem[], storyOf: (storyId: number) => GalleryStory): StoryGroup[] {
    const stories = new Map<number, StoryGroup>();
    for (const item of [...items].sort(newestFirst)) {
        let story = stories.get(item.storyId);
        if (!story) {
            const known = storyOf(item.storyId);
            story = {
                storyId: item.storyId,
                title: storyTitle(known),
                cover: coverBackground({ id: item.storyId, coverImagePath: known.coverImagePath ?? null, coverFocus: known.coverFocus ?? null }),
                count: 0,
                chats: [],
            };
            stories.set(item.storyId, story);
        }
        const key = `${item.storyId}:${item.chatId ?? 'deleted'}`;
        let chat = story.chats.find((candidate) => candidate.key === key);
        if (!chat) {
            chat = { key, chatId: item.chatId, title: item.chatTitle ?? 'Deleted Chats', items: [] };
            story.chats.push(chat);
        }
        chat.items.push(item);
        story.count += 1;
    }
    return [...stories.values()];
}

const pictures = (count: number) => `${count} ${count === 1 ? 'picture' : 'pictures'}`;

/**
 * Snapshots grouped by Story, then by Chat, newest first, as grids of whole images (spec:
 * "Gallery"). On a Story's page it shows that Story's Chats; in the main menu every Story,
 * each folding, with its Chats folding inside it. A tap opens the shared full-screen viewer,
 * which swipes through that Chat's Snapshots and keeps the prompt, download and delete. An item
 * whose Message is gone is marked as from an earlier version of its Chat; one whose Message is
 * still there jumps to it.
 */
export function Gallery({ stories, byStory = false, initialChatId = null }: GalleryProps) {
    const { reportUnreachable } = useConnection();
    const single = !byStory && stories.length === 1;
    const [items, setItems] = useState<GalleryItem[] | null>(null);
    const [viewing, setViewing] = useState<{ chatKey: string; id: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    // The ids, not the array: a page passes a fresh array on every render.
    const allIds = stories.map((story) => story.id).join(',');
    const load = useCallback(async () => {
        try {
            const ids = allIds.split(',').filter(Boolean).map(Number);
            const lists = await Promise.all(
                ids.map(async (id) => (await apiFetch<{ snapshots: GalleryItem[] }>(galleryPath(id, null))).snapshots),
            );
            setItems(lists.flat());
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : 'The Gallery could not be read.');
        }
    }, [allIds, reportUnreachable]);

    useEffect(() => {
        void load();
    }, [load]);

    // Opened on one Chat of a Story (from the Chat's menu): once loaded, that Chat unfolds and
    // comes into view. Only the first time: later reloads (after a delete) leave the page be.
    const openedOn = useRef(false);
    const openChatKey = single && initialChatId !== null ? `${stories[0].id}:${initialChatId}` : null;
    useEffect(() => {
        if (items === null || openChatKey === null || openedOn.current) return;
        openedOn.current = true;
        setFolded(chatFoldKey(openChatKey), false);
        document.getElementById(chatSectionId(openChatKey))?.scrollIntoView({ block: 'start' });
    }, [items, openChatKey]);

    const storyOf = (id: number): GalleryStory => stories.find((story) => story.id === id) ?? { id, title: '' };

    const remove = async (item: GalleryItem) => {
        setViewing(null);
        setError(null);
        try {
            await snapshotApi.remove(item.storyId, item.id);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) {
                reportUnreachable();
                return;
            }
            setError(caught instanceof ApiError ? caught.message : 'The Snapshot could not be deleted.');
        }
        await load();
    };

    if (error && items === null) return <p role="alert">{error}</p>;
    if (items === null) return <p className="muted">Loading…</p>;
    if (items.length === 0) return <p className="muted">No Snapshots yet. Take one in a Chat.</p>;

    const groups = group(items, storyOf);
    const viewingList = viewing && groups.flatMap((story) => story.chats).find((chat) => chat.key === viewing.chatKey)?.items;
    const open = (chat: ChatGroup, item: GalleryItem) => setViewing({ chatKey: chat.key, id: item.id });

    return (
        <>
            {error && <p role="alert">{error}</p>}
            <div className={styles.groups}>
                {groups.map((story) =>
                    single ? (
                        story.chats.map((chat) => <ChatSection key={chat.key} chat={chat} level="h2" onOpen={open} />)
                    ) : (
                        <StorySection key={story.storyId} story={story} onOpen={open} />
                    ),
                )}
            </div>
            {viewing && viewingList && (
                <SnapshotViewer
                    snapshots={viewingList}
                    openId={viewing.id}
                    showLink
                    onClose={() => setViewing(null)}
                    onDelete={(item) => void remove(item)}
                />
            )}
        </>
    );
}

const storyFoldKey = (storyId: number) => `galleryStory:${storyId}`;
const chatFoldKey = (chatKey: string) => `galleryChat:${chatKey}`;
const chatSectionId = (chatKey: string) => `gallery-chat-${chatKey.replace(':', '-')}`;

type Open = (chat: ChatGroup, item: GalleryItem) => void;

/** One Story on the main Gallery: its title and count, folding, its Chats inside. */
function StorySection({ story, onOpen }: { story: StoryGroup; onOpen: Open }) {
    const foldKey = storyFoldKey(story.storyId);
    const folded = useFolded(foldKey);
    const bodyId = `gallery-story-${story.storyId}`;
    return (
        <section className={styles.story} aria-label={story.title}>
            <FoldTitle foldKey={foldKey} controls={bodyId} as="h2">
                {/* The Cover as Home shows it; decorative, the title names the section. */}
                <span className={styles.cover} style={{ background: story.cover }} aria-hidden="true" />
                <span className={styles.storyText}>
                    <span className={styles.groupTitle}>{story.title}</span>
                    <span className={`${styles.count} muted small`}>{pictures(story.count)}</span>
                </span>
            </FoldTitle>
            <div id={bodyId} hidden={folded} className={styles.storyBody}>
                {story.chats.map((chat) => (
                    <ChatSection key={chat.key} chat={chat} level="h3" onOpen={onOpen} />
                ))}
            </div>
        </section>
    );
}

/** One Chat's Snapshots: its title and count, folding, then the grid. */
function ChatSection({ chat, level, onOpen }: { chat: ChatGroup; level: 'h2' | 'h3'; onOpen: Open }) {
    const foldKey = chatFoldKey(chat.key);
    const folded = useFolded(foldKey);
    const sectionId = chatSectionId(chat.key);
    const bodyId = `${sectionId}-body`;
    return (
        <section id={sectionId} className={styles.chat} aria-label={chat.title}>
            <FoldTitle foldKey={foldKey} controls={bodyId} as={level}>
                <span className={styles.groupTitle}>{chat.title}</span>
                <span className={`${styles.count} muted small`}>{pictures(chat.items.length)}</span>
            </FoldTitle>
            <ul id={bodyId} hidden={folded} className={styles.grid} aria-label={`Snapshots of ${chat.title}`}>
                {chat.items.map((item) => (
                    <li key={item.id}>
                        <button type="button" className={styles.thumb} onClick={() => onOpen(chat, item)}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
                            <img src={snapshotImageUrl(item)} alt={snapshotAlt(item)} />
                        </button>
                        {item.messageId === null && <span className={`${styles.earlier} small`}>{EARLIER_VERSION}</span>}
                    </li>
                ))}
            </ul>
        </section>
    );
}

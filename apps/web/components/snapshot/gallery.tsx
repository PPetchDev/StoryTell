'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { FoldTitle } from '@/components/fold/fold-button';
import { ErrorState, Loading } from '@/components/query-state';
import { SnapshotViewer, snapshotAlt } from '@/components/snapshot/snapshot-viewer';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { setFolded, useFolded } from '@/lib/folds';
import { coverThumbBackground } from '@/lib/home';
import { EARLIER_VERSION, GalleryItem, galleryPath, snapshotApi, snapshotImageUrl, snapshotThumbUrl } from '@/lib/snapshot';
import { StorySummary, storyTitle } from '@/lib/story';

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
    /** The Cover's CSS background: a thumbnail at its focus point over the Story's gradient. */
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
                cover: coverThumbBackground({ id: item.storyId, coverImagePath: known.coverImagePath ?? null, coverFocus: known.coverFocus ?? null }),
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

/** A tile's button, found again after the list is read anew. */
const thumbSelector = (id: number) => `[data-snapshot-thumb="${id}"]`;

/**
 * Snapshots grouped by Story, then by Chat, newest first, as grids of whole images (spec:
 * "Gallery"). On a Story's page it shows that Story's Chats; in the main menu every Story,
 * each folding, with its Chats folding inside it. A folded group draws no pictures until it is
 * opened (audit H33). A tap opens the shared full-screen viewer, which swipes through that
 * Chat's Snapshots and keeps the prompt, download and delete. An item whose Message is gone is
 * marked as from an earlier version of its Chat; one whose Message is still there jumps to it.
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
            setError(null);
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

    if (items === null) {
        if (error) return <ErrorState title="Couldn't load the Gallery." error={error} onRetry={() => void load()} />;
        return <Loading label="Loading the Gallery…" />;
    }
    if (items.length === 0) return <p className="muted">No Snapshots yet. Take one in a Chat.</p>;

    const groups = group(items, storyOf);
    const chats = groups.flatMap((story) => story.chats);
    const viewingList = viewing && chats.find((chat) => chat.key === viewing.chatKey)?.items;
    const open = (chat: ChatGroup, item: GalleryItem) => setViewing({ chatKey: chat.key, id: item.id });

    /**
     * Deletes from the viewer, which stays open with the reason if it fails (audit L25). Once it
     * is gone, focus goes to the next tile of its Chat, or the one before, or the Chat's title (M50).
     */
    const remove = async (item: GalleryItem) => {
        try {
            await snapshotApi.remove(item.storyId, item.id);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) {
                reportUnreachable();
                return;
            }
            throw new Error(caught instanceof ApiError ? caught.message : 'The Snapshot could not be deleted.');
        }
        const chat = chats.find((each) => each.items.some((candidate) => candidate.id === item.id));
        const at = chat?.items.findIndex((candidate) => candidate.id === item.id) ?? -1;
        const neighbour = chat && (chat.items[at + 1] ?? chat.items[at - 1]);
        setViewing(null);
        await load();
        requestAnimationFrame(() => {
            const target =
                (neighbour && document.querySelector<HTMLElement>(thumbSelector(neighbour.id))) ||
                (chat && document.querySelector<HTMLElement>(`#${chatSectionId(chat.key)} button[aria-expanded]`)) ||
                document.querySelector<HTMLElement>('main h1');
            if (target?.tagName === 'H1') target.tabIndex = -1;
            target?.focus();
        });
    };

    return (
        <>
            {error && <ErrorState title="Couldn't load the Gallery again." error={error} onRetry={() => void load()} className="mb-4" />}
            <div className="grid gap-5">
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
                    onDelete={(item) => remove(item)}
                />
            )}
        </>
    );
}

const storyFoldKey = (storyId: number) => `galleryStory:${storyId}`;
const chatFoldKey = (chatKey: string) => `galleryChat:${chatKey}`;
const chatSectionId = (chatKey: string) => `gallery-chat-${chatKey.replace(':', '-')}`;

type Open = (chat: ChatGroup, item: GalleryItem) => void;

/** A group's count beside its title. */
function Count({ count }: { count: number }) {
    return <span className="flex-none text-sm font-normal text-muted">{pictures(count)}</span>;
}

/** One Story on the main Gallery: its title and count, folding, its Chats inside. */
function StorySection({ story, onOpen }: { story: StoryGroup; onOpen: Open }) {
    const foldKey = storyFoldKey(story.storyId);
    const folded = useFolded(foldKey);
    const bodyId = `gallery-story-${story.storyId}`;
    return (
        <section className="grid gap-2 rounded-lg border border-line bg-surface px-4 pt-3 pb-4 text-lg" aria-label={story.title}>
            <FoldTitle foldKey={foldKey} controls={bodyId} as="h2">
                {/* The Cover as Home shows it; decorative, the title names the section. */}
                <span className="block aspect-[3/4] w-18 flex-none rounded-md lg:w-24" style={{ background: story.cover }} aria-hidden="true" />
                <span className="grid min-w-0 gap-0.5">
                    <span className="min-w-0 [overflow-wrap:anywhere]">{story.title}</span>
                    <Count count={story.count} />
                </span>
            </FoldTitle>
            {/* Folded, it holds nothing: no picture is fetched for a group nobody opened. */}
            <div id={bodyId} hidden={folded} className="grid gap-4 text-base">
                {!folded && story.chats.map((chat) => <ChatSection key={chat.key} chat={chat} level="h3" onOpen={onOpen} />)}
            </div>
        </section>
    );
}

/**
 * A tile: the whole image, never cropped, every tile the same size. Until the picture loads, and
 * round a picture of another shape, the tile shows the raised surface of the theme, not the
 * viewer's black, so a loading tile does not read as a broken one (docs/ui-audit-2026-11-13.md, M17).
 */
const THUMB = 'bare-button block aspect-[2/3] w-full overflow-hidden rounded-sm border border-line bg-surface-raised';

/** One Chat's Snapshots: its title and count, folding, then the grid. */
function ChatSection({ chat, level, onOpen }: { chat: ChatGroup; level: 'h2' | 'h3'; onOpen: Open }) {
    const foldKey = chatFoldKey(chat.key);
    const folded = useFolded(foldKey);
    const sectionId = chatSectionId(chat.key);
    const bodyId = `${sectionId}-body`;
    return (
        <section id={sectionId} className="grid gap-2" aria-label={chat.title}>
            <FoldTitle foldKey={foldKey} controls={bodyId} as={level}>
                <span className="min-w-0 [overflow-wrap:anywhere]">{chat.title}</span>
                <Count count={chat.items.length} />
            </FoldTitle>
            <ul
                id={bodyId}
                hidden={folded}
                className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3 p-0 lg:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))]"
                aria-label={`Snapshots of ${chat.title}`}
            >
                {!folded &&
                    chat.items.map((item) => (
                        <li key={item.id} className="grid content-start gap-1">
                            <button type="button" className={THUMB} data-snapshot-thumb={item.id} onClick={() => onOpen(chat, item)}>
                                {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail the API makes; the full image is the fallback */}
                                <img
                                    src={snapshotImageUrl(item)}
                                    srcSet={`${snapshotThumbUrl(item, 320)} 320w, ${snapshotThumbUrl(item, 640)} 640w`}
                                    sizes="(min-width: 1024px) 12rem, 34vw"
                                    alt={snapshotAlt(item)}
                                    loading="lazy"
                                    decoding="async"
                                    className="block size-full object-contain"
                                />
                            </button>
                            {item.messageId === null && <span className="text-sm text-earlier-text">{EARLIER_VERSION}</span>}
                        </li>
                    ))}
            </ul>
        </section>
    );
}

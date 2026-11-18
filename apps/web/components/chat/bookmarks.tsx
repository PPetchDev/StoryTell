'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { announce } from '@/components/announcer';
import { ACTION, ACTION_ICON } from '@/components/chat/chat-classes';
import { useConnection } from '@/components/connection';
import { BookmarkIcon } from '@/components/icons';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { Bookmark, chatSearchApi } from '@/lib/chat-search';

/** A Chat's Bookmarks (.scratch/chat-search/spec.md), as the thread and the Find sheet read them. */
export interface ChatBookmarks {
    /** In thread order, as the API last answered them. */
    list: Bookmark[];
    /** Whether the list has been read at least once. */
    loaded: boolean;
    has(messageId: number): boolean;
    /** Marks or unmarks a Message at once, and puts it back with a spoken notice if the API refuses. */
    toggle(messageId: number): void;
    remove(messageId: number): void;
    /** Reads the list again: the Find sheet does on opening, since an edit or a Reset drops some. */
    refresh(): void;
}

const BookmarksContext = createContext<ChatBookmarks | null>(null);

/** The Bookmarks of one Chat, read on opening it and kept as the user marks. */
export function useChatBookmarks(storyId: number, chatId: number): ChatBookmarks {
    const { reportUnreachable } = useConnection();
    const [list, setList] = useState<Bookmark[]>([]);
    const [loaded, setLoaded] = useState(false);
    const marked = useMemo(() => new Set(list.map((bookmark) => bookmark.messageId)), [list]);
    /** What each toggle in flight wants, so a double tap ends where the last tap left it. */
    const [pending, setPending] = useState<Map<number, boolean>>(new Map());
    const latest = useRef(0);

    const refresh = useCallback(() => {
        const asked = ++latest.current;
        chatSearchApi.bookmarks(storyId, chatId).then(
            (bookmarks) => {
                if (asked !== latest.current) return;
                setList(bookmarks);
                setLoaded(true);
            },
            (caught: unknown) => {
                if (caught instanceof ApiUnreachableError) reportUnreachable();
            },
        );
    }, [storyId, chatId, reportUnreachable]);

    useEffect(refresh, [refresh]);

    const has = useCallback((messageId: number) => pending.get(messageId) ?? marked.has(messageId), [pending, marked]);

    const set = useCallback(
        (messageId: number, on: boolean) => {
            setPending((current) => new Map(current).set(messageId, on));
            const asked = ++latest.current;
            announce(on ? 'Bookmarked.' : 'Bookmark removed.');
            chatSearchApi.setBookmark(storyId, chatId, messageId, on).then(
                (bookmarks) => {
                    if (asked === latest.current) {
                        setList(bookmarks);
                        setLoaded(true);
                    }
                },
                (caught: unknown) => {
                    if (caught instanceof ApiUnreachableError) reportUnreachable();
                    announce(caught instanceof ApiError ? `The bookmark wasn't saved: ${caught.message}` : "The bookmark wasn't saved.", 'assertive');
                    // What the API holds now, since an answer to an earlier tap may have been passed over for this one.
                    refresh();
                },
            ).finally(() =>
                setPending((current) => {
                    if (current.get(messageId) !== on) return current;
                    const next = new Map(current);
                    next.delete(messageId);
                    return next;
                }),
            );
        },
        [storyId, chatId, reportUnreachable, refresh],
    );

    return useMemo(
        () => ({
            list,
            loaded,
            has,
            toggle: (messageId: number) => set(messageId, !has(messageId)),
            remove: (messageId: number) => set(messageId, false),
            refresh,
        }),
        [list, loaded, has, set, refresh],
    );
}

export function BookmarksProvider({ value, children }: { value: ChatBookmarks; children: ReactNode }) {
    return <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>;
}

/**
 * 🔖 Bookmark among a Message's actions: a toggle, pressed while the Message is marked. Its label
 * stays "Bookmark" either way, so the action row's measured widths hold. Nothing outside a Chat.
 */
export function BookmarkAction({ messageId }: { messageId: number }) {
    const bookmarks = useContext(BookmarksContext);
    if (!bookmarks) return null;
    const on = bookmarks.has(messageId);
    return (
        <button type="button" className={ACTION} aria-pressed={on} data-bookmark-action onClick={() => bookmarks.toggle(messageId)}>
            <BookmarkIcon size={16} className={ACTION_ICON} fill={on ? 'currentColor' : 'none'} />
            Bookmark
        </button>
    );
}

/** The small "Bookmarked" line under a marked Message, so the marks show while scrolling. */
export function BookmarkedMark({ messageId, end }: { messageId: number; end: boolean }) {
    const bookmarks = useContext(BookmarksContext);
    if (!bookmarks?.has(messageId)) return null;
    return (
        <p className={`mt-1 mb-0 flex items-center gap-1 text-xs font-semibold text-muted ${end ? 'justify-end' : ''}`} data-bookmarked>
            <BookmarkIcon size={14} fill="currentColor" className="text-accent" />
            Bookmarked
        </p>
    );
}

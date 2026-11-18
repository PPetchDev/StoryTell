'use client';

import { KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';

import { ChatBookmarks } from '@/components/chat/bookmarks';
import { useConnection } from '@/components/connection';
import { BookmarkIcon, CloseIcon, SearchIcon } from '@/components/icons';
import { Sheet } from '@/components/sheet/sheet';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { Message } from '@/lib/chat';
import { chatSearchApi, SEARCH_MAX, SEARCH_MIN, searchable, SearchResult } from '@/lib/chat-search';

export type FindTab = 'search' | 'bookmarks';

/** How long after the last keystroke the search runs. */
const SEARCH_DELAY_MS = 300;

/** The two tabs: a row of two halves, 44px tall, the chosen one filled. */
const TABS = 'grid grid-cols-2 gap-1 rounded-full border border-line bg-bg p-1';
const TAB = [
    'bare-button min-h-11 min-w-0 cursor-pointer rounded-full px-2 text-sm font-bold text-muted',
    'aria-selected:bg-accent-fill aria-selected:text-accent-text not-aria-selected:active:bg-surface-raised',
    'focus-ring',
].join(' ');

/** A result or a bookmark: the whole row is the jump, at least 44px tall. */
const ROW = [
    'bare-button grid w-full min-w-0 cursor-pointer gap-0.5 rounded-md px-3 py-2.5 text-left',
    'press focus-ring-inset active:bg-surface-raised',
].join(' ');
const ROW_HEAD = 'flex min-w-0 items-baseline gap-2 text-sm';
const ROW_TEXT = 'm-0 text-note leading-snug text-text [overflow-wrap:anywhere]';

type SearchState =
    | { status: 'idle' }
    | { status: 'searching'; query: string; last: SearchResult | null }
    | { status: 'done'; query: string; result: SearchResult }
    | { status: 'failed'; query: string; message: string };

interface FindSheetProps {
    storyId: number;
    chatId: number;
    /** The Chat's Messages, to say which one a result is ("Message 412"). */
    messages: readonly Message[];
    bookmarks: ChatBookmarks;
    tab: FindTab;
    onTab(tab: FindTab): void;
    /** Kept by the screen, so the sheet opens again on the last search. */
    query: string;
    onQuery(query: string): void;
    /** Closes the sheet and goes to the Message. */
    onJump(messageId: number): void;
    onClose(): void;
}

/**
 * "Find in this Chat" (.scratch/chat-search/spec.md): Search over the Chat's words, newest first,
 * and its Bookmarks in thread order. A tap on either goes to the Message in the thread.
 */
export function FindSheet({ storyId, chatId, messages, bookmarks, tab, onTab, query, onQuery, onJump, onClose }: FindSheetProps) {
    const tabsId = useId();
    const numberOf = useMemo(() => new Map(messages.map((message, index) => [message.id, index + 1])), [messages]);
    const present = (messageId: number) => numberOf.has(messageId);
    const { refresh } = bookmarks;
    // An edit or a Reset may have dropped some since the list was read.
    useEffect(refresh, [refresh]);

    const keyTabs = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const next: FindTab = tab === 'search' ? 'bookmarks' : 'search';
        onTab(next);
        document.getElementById(`${tabsId}-${next}`)?.focus();
    };
    const shown = bookmarks.list.filter((bookmark) => present(bookmark.messageId));

    return (
        <Sheet label="Find in this Chat" title="Find" onClose={onClose}>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-1">
                <div className={TABS} role="tablist" aria-label="Find" onKeyDown={keyTabs}>
                    {(['search', 'bookmarks'] as const).map((name) => (
                        <button
                            key={name}
                            id={`${tabsId}-${name}`}
                            type="button"
                            role="tab"
                            className={TAB}
                            aria-selected={tab === name}
                            aria-controls={`${tabsId}-${name}-panel`}
                            tabIndex={tab === name ? 0 : -1}
                            onClick={() => onTab(name)}
                        >
                            {name === 'search' ? 'Search' : `Bookmarks${bookmarks.loaded ? ` (${shown.length})` : ''}`}
                        </button>
                    ))}
                </div>
                <div id={`${tabsId}-${tab}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${tab}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
                    {tab === 'search' ? (
                        <SearchPanel storyId={storyId} chatId={chatId} query={query} onQuery={onQuery} numberOf={numberOf} onJump={onJump} />
                    ) : (
                        <BookmarksPanel bookmarks={bookmarks} shown={shown} numberOf={numberOf} onJump={onJump} />
                    )}
                </div>
            </div>
        </Sheet>
    );
}

interface SearchPanelProps {
    storyId: number;
    chatId: number;
    query: string;
    onQuery(query: string): void;
    numberOf: Map<number, number>;
    onJump(messageId: number): void;
}

function SearchPanel({ storyId, chatId, query, onQuery, numberOf, onJump }: SearchPanelProps) {
    const { reportUnreachable } = useConnection();
    const inputRef = useRef<HTMLInputElement>(null);
    const statusId = useId();
    const [state, setState] = useState<SearchState>({ status: 'idle' });
    const wanted = searchable(query);
    const tooShort = wanted.length < SEARCH_MIN;

    // The field takes the focus once the sheet has it, so the keyboard comes up ready to type.
    useEffect(() => {
        const frame = requestAnimationFrame(() => inputRef.current?.focus());
        return () => cancelAnimationFrame(frame);
    }, []);

    useEffect(() => {
        if (tooShort) {
            setState({ status: 'idle' });
            return;
        }
        setState((current) => ({ status: 'searching', query: wanted, last: current.status === 'done' ? current.result : current.status === 'searching' ? current.last : null }));
        const stop = new AbortController();
        const timer = setTimeout(() => {
            chatSearchApi.search(storyId, chatId, wanted, stop.signal).then(
                (result) => setState({ status: 'done', query: wanted, result }),
                (caught: unknown) => {
                    if (stop.signal.aborted) return;
                    if (caught instanceof ApiUnreachableError) reportUnreachable();
                    setState({ status: 'failed', query: wanted, message: caught instanceof ApiError ? caught.message : "Couldn't search." });
                },
            );
        }, SEARCH_DELAY_MS);
        return () => {
            clearTimeout(timer);
            stop.abort();
        };
    }, [storyId, chatId, wanted, tooShort, reportUnreachable]);

    const result = state.status === 'done' ? state.result : state.status === 'searching' ? state.last : null;
    let status: string;
    if (tooShort) status = wanted.length === 0 ? 'Words, a name or a line, in English or Thai.' : `Type at least ${SEARCH_MIN} characters.`;
    else if (state.status === 'failed') status = state.message;
    else if (state.status !== 'done') status = 'Searching…';
    else if (state.result.total === 0) status = `Nothing in this Chat says “${state.query}”.`;
    else if (state.result.total > state.result.hits.length) status = `Showing the newest ${state.result.hits.length} of ${state.result.total}. Add words to narrow it.`;
    else status = state.result.total === 1 ? '1 place, newest first.' : `${state.result.total} places, newest first.`;

    return (
        <>
            <form role="search" className="field relative my-0" onSubmit={(event) => event.preventDefault()}>
                <SearchIcon size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
                <input
                    ref={inputRef}
                    type="search"
                    className="pr-11 pl-10 [&::-webkit-search-cancel-button]:appearance-none"
                    aria-label="Search this Chat"
                    aria-describedby={statusId}
                    placeholder="Search this Chat"
                    enterKeyHint="search"
                    maxLength={SEARCH_MAX}
                    value={query}
                    onChange={(event) => onQuery(event.target.value)}
                />
                {query !== '' && (
                    <button
                        type="button"
                        className="bare-button absolute top-1/2 right-0 grid size-11 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-muted press focus-ring"
                        aria-label="Clear search"
                        onClick={() => {
                            onQuery('');
                            inputRef.current?.focus();
                        }}
                    >
                        <CloseIcon size={18} />
                    </button>
                )}
            </form>
            <p id={statusId} className="m-0 px-1 text-sm text-muted" role="status">
                {status}
            </p>
            {!tooShort && result && result.hits.length > 0 && (
                <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-0.5 p-0" aria-label="Results" aria-busy={state.status === 'searching'}>
                    {result.hits.map((hit, index) => {
                        const number = numberOf.get(hit.messageId);
                        return (
                            <li key={`${hit.messageId}-${index}`} className="min-w-0">
                                <button type="button" className={ROW} disabled={number === undefined} onClick={() => onJump(hit.messageId)} data-search-hit>
                                    <span className={ROW_HEAD}>
                                        <strong className="min-w-0 truncate text-text">{hit.speaker}</strong>
                                        {number !== undefined && <span className="shrink-0 text-muted">Message {number}</span>}
                                    </span>
                                    <span className={ROW_TEXT}>
                                        {hit.snippet.slice(0, hit.match.start)}
                                        <mark className="rounded-sm bg-accent-soft px-0.5 font-semibold text-text">
                                            {hit.snippet.slice(hit.match.start, hit.match.start + hit.match.length)}
                                        </mark>
                                        {hit.snippet.slice(hit.match.start + hit.match.length)}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </>
    );
}

interface BookmarksPanelProps {
    bookmarks: ChatBookmarks;
    shown: ChatBookmarks['list'];
    numberOf: Map<number, number>;
    onJump(messageId: number): void;
}

function BookmarksPanel({ bookmarks, shown, numberOf, onJump }: BookmarksPanelProps) {
    if (!bookmarks.loaded) return <p className="m-0 px-1 text-sm text-muted">Loading bookmarks…</p>;
    if (shown.length === 0) {
        return (
            <p className="m-0 px-1 text-sm text-muted">
                No bookmarks yet. Tap a Message, then <strong>Bookmark</strong>, to come back to it from here.
            </p>
        );
    }
    return (
        <ul className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-0.5 p-0" aria-label="Bookmarks">
            {shown.map((bookmark) => {
                const number = numberOf.get(bookmark.messageId);
                const name = `${bookmark.speaker}, Message ${number}`;
                return (
                    <li key={bookmark.messageId} className="flex min-w-0 items-start gap-1" data-bookmark-row>
                        <button type="button" className={`${ROW} flex-1`} onClick={() => onJump(bookmark.messageId)}>
                            <span className={ROW_HEAD}>
                                <BookmarkIcon size={14} fill="currentColor" className="shrink-0 self-center text-accent" />
                                <strong className="min-w-0 truncate text-text">{bookmark.speaker}</strong>
                                <span className="shrink-0 text-muted">Message {number}</span>
                            </span>
                            <span className={`${ROW_TEXT} line-clamp-2`}>{bookmark.snippet}</span>
                        </button>
                        <button
                            type="button"
                            className="bare-button grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted press focus-ring"
                            aria-label={`Remove bookmark: ${name}`}
                            onClick={() => bookmarks.remove(bookmark.messageId)}
                        >
                            <CloseIcon size={18} />
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ArrowLeftIcon, ChaptersIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { ErrorState, Loading } from '@/components/query-state';
import { Sheet } from '@/components/sheet/sheet';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { Book, bookApi, BookChapter, chapterTitle, formatEstimate, paragraphs, readPlace, savePlace } from '@/lib/book';

/** How often the Book is read again while a chapter is waiting or being written. */
const WRITING_POLL_MS = 1_500;

/** A chapter's state in a word or two, for the Contents. */
const STATE_NOTE: Record<BookChapter['state'], string> = {
    unwritten: 'Not written',
    queued: 'Waiting',
    writing: 'Writing…',
    written: '',
    failed: 'Couldn’t write',
    empty: 'Nothing happened',
};

interface BookViewProps {
    storyId: string;
    chatId: string;
}

/**
 * The Book view (.scratch/chat-novel/spec.md): one Book chapter at a time, in a reading type, with
 * Previous and Next, Contents, writing (priced first), Rewrite, Edit, and where the reader left off.
 */
export function BookView({ storyId, chatId }: BookViewProps) {
    const { reportUnreachable } = useConnection();
    const [book, setBook] = useState<Book | null>(null);
    const [loadError, setLoadError] = useState<unknown>(null);
    const [error, setError] = useState<string | null>(null);
    const [number, setNumber] = useState<number | null>(null);
    const [editing, setEditing] = useState<{ title: string; text: string } | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [working, setWorking] = useState(false);
    const [contents, setContents] = useState(false);
    const restored = useRef(false);
    const titleId = useId();

    const load = useCallback(async () => {
        try {
            const next = await bookApi.get(storyId, chatId);
            setBook(next);
            setLoadError(null);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            setLoadError(caught);
        }
    }, [storyId, chatId, reportUnreachable]);

    useEffect(() => {
        void load();
    }, [load]);

    // A chapter waiting or being written shows as it comes.
    useEffect(() => {
        if (!book?.writing) return;
        const timer = setTimeout(() => void load(), WRITING_POLL_MS);
        return () => clearTimeout(timer);
    }, [book, load]);

    // Opens where the reader left off, or at the first chapter.
    useEffect(() => {
        if (!book || number !== null || book.chapters.length === 0) return;
        const place = readPlace(chatId);
        const known = place && book.chapters.some((chapter) => chapter.number === place.number);
        setNumber(known ? place.number : book.chapters[0].number);
        if (!known) restored.current = true;
    }, [book, number, chatId]);

    // Then scrolls to how far down it they were, once.
    useEffect(() => {
        if (restored.current || number === null || !book) return;
        restored.current = true;
        const place = readPlace(chatId);
        if (!place || place.number !== number || place.scroll <= 0) return;
        requestAnimationFrame(() => {
            const room = document.documentElement.scrollHeight - window.innerHeight;
            if (room > 0) window.scrollTo(0, place.scroll * room);
        });
    }, [book, number, chatId]);

    // Keeps the place as the reader scrolls.
    useEffect(() => {
        if (number === null) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onScroll = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const room = document.documentElement.scrollHeight - window.innerHeight;
                savePlace(chatId, { number, scroll: room > 0 ? window.scrollY / room : 0 });
            }, 250);
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            clearTimeout(timer);
            window.removeEventListener('scroll', onScroll);
        };
    }, [number, chatId]);

    const go = (to: number) => {
        setNumber(to);
        setEditing(null);
        setConfirming(false);
        setError(null);
        savePlace(chatId, { number: to, scroll: 0 });
        window.scrollTo(0, 0);
    };

    const run = async (work: () => Promise<Book>, fallback: string) => {
        setWorking(true);
        setError(null);
        try {
            setBook(await work());
            return true;
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            setError(caught instanceof ApiError ? caught.message : fallback);
            return false;
        } finally {
            setWorking(false);
        }
    };

    if (loadError && !book) {
        return (
            <main>
                <ErrorState error={loadError instanceof Error ? loadError : String(loadError)} title="Couldn't load the Book." onRetry={() => void load()} />
                <Link href={`/stories/${storyId}/chats/${chatId}`}>Back to the Chat</Link>
            </main>
        );
    }
    if (!book) {
        return (
            <main>
                <Loading label="Loading the Book…" lines={6} />
            </main>
        );
    }

    const index = book.chapters.findIndex((chapter) => chapter.number === number);
    const chapter = index === -1 ? null : book.chapters[index];
    const previous = index > 0 ? book.chapters[index - 1] : null;
    const next = index !== -1 && index < book.chapters.length - 1 ? book.chapters[index + 1] : null;
    const write = (numbers?: number[]) => run(() => bookApi.write(storyId, chatId, numbers), 'Could not start writing.');
    const written = book.chapters.filter((candidate) => candidate.text !== null);

    return (
        <>
            <main className="book-screen grid grid-cols-[minmax(0,1fr)] gap-4 pb-6">
                <nav aria-label="Book" className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/stories/${storyId}/chats/${chatId}`} className="button button-quiet min-w-0 max-w-full">
                        <ArrowLeftIcon size={18} className="flex-none" />
                        <span className="min-w-0 truncate">Back to the Chat</span>
                    </Link>
                    <button type="button" className="button button-quiet" onClick={() => setContents(true)}>
                        <ChaptersIcon size={18} className="flex-none" />
                        Contents
                    </button>
                </nav>

                <header className="grid gap-0.5 text-center">
                    <p className="m-0 text-sm text-muted [overflow-wrap:anywhere]">{book.title}</p>
                    {!chapter && <h1 className="m-0 [overflow-wrap:anywhere]">Book</h1>}
                </header>

                {error && (
                    <p role="alert" className="turn-error m-0">
                        {error}
                    </p>
                )}

                {!chapter ? (
                    <p className="m-0 text-muted">
                        This Chat has no Chapters yet. A Chapter ends each time the story moves on to another Scene; each one becomes a chapter
                        of the Book.
                    </p>
                ) : (
                    <article aria-labelledby={titleId} className="mx-auto grid w-full max-w-[36rem] grid-cols-[minmax(0,1fr)] gap-4" data-book-chapter={chapter.number}>
                        <header className="grid gap-1 text-center">
                            <p className="m-0 text-sm tracking-wide text-muted uppercase">Chapter {chapter.number}</p>
                            <h1 id={titleId} className="m-0 text-2xl [overflow-wrap:anywhere]">
                                {chapterTitle(chapter)}
                            </h1>
                        </header>

                        <ChapterNotes chapter={chapter} />

                        {editing ? (
                            <form
                                className="grid gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    void run(() => bookApi.save(storyId, chatId, chapter.number, editing.title, editing.text), 'Could not save the chapter.').then(
                                        (saved) => saved && setEditing(null),
                                    );
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape' && !working) setEditing(null);
                                }}
                            >
                                <div className="field my-0">
                                    <label htmlFor={`${titleId}-title`}>Title</label>
                                    <input id={`${titleId}-title`} value={editing.title} disabled={working} onChange={(event) => setEditing({ ...editing, title: event.target.value })} />
                                </div>
                                <div className="field my-0">
                                    <label htmlFor={`${titleId}-text`}>Text</label>
                                    <textarea
                                        id={`${titleId}-text`}
                                        rows={16}
                                        className="book-prose"
                                        value={editing.text}
                                        disabled={working}
                                        onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                                    />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button type="submit" className="button" disabled={working || editing.title.trim() === '' || editing.text.trim() === ''}>
                                        Save
                                    </button>
                                    <button type="button" className="button button-quiet" disabled={working} onClick={() => setEditing(null)}>
                                        Cancel
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <>
                                {/* While it is written, the text as it comes; else the text it has, an old one through a failed write too. */}
                                {chapter.state === 'writing' ? <Prose text={chapter.draft ?? ''} /> : chapter.text && <Prose text={chapter.text} />}
                                <ChapterActions
                                    chapter={chapter}
                                    working={working}
                                    confirming={confirming}
                                    onWrite={() => void write([chapter.number])}
                                    onAskRewrite={() => setConfirming(true)}
                                    onCancelRewrite={() => setConfirming(false)}
                                    onEdit={() => setEditing({ title: chapterTitle(chapter), text: chapter.text ?? '' })}
                                    onRemove={() => void run(() => bookApi.remove(storyId, chatId, chapter.number), 'Could not remove the chapter.')}
                                />
                            </>
                        )}
                    </article>
                )}

                {chapter && (
                    <nav aria-label="Chapters" className="mx-auto grid w-full max-w-[36rem] grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-line pt-4">
                        <button type="button" className="button button-quiet justify-self-start" disabled={!previous} onClick={() => previous && go(previous.number)}>
                            <ChevronLeftIcon size={18} className="flex-none" />
                            Previous
                        </button>
                        <span className="text-sm whitespace-nowrap text-muted">
                            {index + 1} of {book.chapters.length}
                        </span>
                        <button type="button" className="button button-quiet justify-self-end" disabled={!next} onClick={() => next && go(next.number)}>
                            Next
                            <ChevronRightIcon size={18} className="flex-none" />
                        </button>
                    </nav>
                )}
            </main>

            {/* Print or save as PDF: every written chapter, each on a new page (app/styles/book.css). */}
            <div className="book-print" aria-hidden="true">
                <h1>{book.title}</h1>
                <p style={{ textAlign: 'center' }}>{book.chatTitle}</p>
                {written.map((chapter) => (
                    <section key={chapter.number} className="book-print-chapter">
                        <p style={{ textAlign: 'center' }}>Chapter {chapter.number}</p>
                        <h2>{chapterTitle(chapter)}</h2>
                        <Prose text={chapter.text!} />
                    </section>
                ))}
            </div>

            {contents && (
                <Sheet label="Contents" title="Contents" onClose={() => setContents(false)}>
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-1">
                        {error && (
                            <p role="alert" className="turn-error m-0">
                                {error}
                            </p>
                        )}
                        {book.chapters.length === 0 ? (
                            <p className="m-0 text-muted">No chapters yet.</p>
                        ) : (
                            <ol className="m-0 grid list-none gap-1 p-0" aria-label="Chapters of the Book">
                                {book.chapters.map((entry) => (
                                    <li key={entry.number}>
                                        <button
                                            type="button"
                                            className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-bg"
                                            aria-current={entry.number === number ? 'true' : undefined}
                                            onClick={() => {
                                                setContents(false);
                                                go(entry.number);
                                            }}
                                        >
                                            <span className="w-6 flex-none text-muted">{entry.number}</span>
                                            <span className={`min-w-0 flex-1 [overflow-wrap:anywhere] ${entry.number === number ? 'font-semibold' : ''}`}>{chapterTitle(entry)}</span>
                                            <span className="flex-none text-sm text-muted">{entry.outOfDate ? 'Out of date' : STATE_NOTE[entry.state]}</span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        )}
                        {book.writeAllCount > 0 && (
                            <button type="button" className="button" disabled={working} onClick={() => void write()}>
                                Write {book.writeAllCount === 1 ? '1 chapter' : `all ${book.writeAllCount}`} · {formatEstimate(book.writeAllPriceUsd)}
                            </button>
                        )}
                        <p className="m-0 text-sm text-muted">
                            Written by your play model as you ask. The price is an estimate at its list price; what a write costs shows on Usage.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {written.length > 0 ? (
                                <a href={bookApi.epubHref(storyId, chatId)} className="button button-quiet" download>
                                    Download EPUB
                                </a>
                            ) : (
                                <button type="button" className="button button-quiet" disabled>
                                    Download EPUB
                                </button>
                            )}
                            <button
                                type="button"
                                className="button button-quiet"
                                disabled={written.length === 0}
                                onClick={() => {
                                    setContents(false);
                                    // After the sheet has gone, so it isn't printed over the Book.
                                    setTimeout(() => window.print(), 50);
                                }}
                            >
                                Print or save as PDF
                            </button>
                        </div>
                    </div>
                </Sheet>
            )}
        </>
    );
}

function Prose({ text }: { text: string }) {
    return (
        <div className="book-prose">
            {paragraphs(text).map((paragraph, at) => (
                <p key={at} className="whitespace-pre-line">
                    {paragraph}
                </p>
            ))}
        </div>
    );
}

/** What stands above a chapter's text: out of date, waiting, writing, failed or not written. */
function ChapterNotes({ chapter }: { chapter: BookChapter }) {
    const notes: string[] = [];
    if (chapter.state === 'queued') notes.push('Waiting its turn…');
    if (chapter.state === 'writing') notes.push('Writing…');
    if (chapter.state === 'failed') notes.push(`Couldn’t write this one: ${chapter.failedReason ?? 'something went wrong.'}`);
    if (chapter.state === 'empty') notes.push('Nothing happened in this Chapter, so there is nothing to write.');
    if (chapter.state === 'unwritten') notes.push('Not written yet.');
    if (chapter.outOfDate) notes.push(chapter.chapterGone ? 'Its Chapter was taken back.' : 'Its Chapter changed since this was written.');
    if (chapter.writtenBy === 'user' && !chapter.outOfDate && chapter.state === 'written') notes.push('Edited by you.');
    if (notes.length === 0) return null;
    return (
        <div className="grid gap-1" role={chapter.state === 'writing' || chapter.state === 'queued' ? 'status' : undefined}>
            {notes.map((note) => (
                <p key={note} className="m-0 rounded-lg bg-surface px-3 py-2 text-sm text-muted [overflow-wrap:anywhere]">
                    {note}
                </p>
            ))}
        </div>
    );
}

interface ChapterActionsProps {
    chapter: BookChapter;
    working: boolean;
    confirming: boolean;
    onWrite(): void;
    onAskRewrite(): void;
    onCancelRewrite(): void;
    onEdit(): void;
    onRemove(): void;
}

/** Write, Rewrite (asked first over the user's own text), Edit and Remove, each priced where it costs. */
function ChapterActions({ chapter, working, confirming, onWrite, onAskRewrite, onCancelRewrite, onEdit, onRemove }: ChapterActionsProps) {
    if (chapter.state === 'queued' || chapter.state === 'writing') return null;
    const price = chapter.priceUsd === null ? '' : ` · ${formatEstimate(chapter.priceUsd)}`;
    const canWrite = chapter.priceUsd !== null;
    const hasText = chapter.text !== null;
    if (confirming) {
        return (
            <div role="group" aria-label="Rewrite your own text?" className="grid gap-2 rounded-lg bg-surface px-3 py-2.5">
                <p className="m-0 text-sm">This replaces your own text.</p>
                <div className="flex flex-wrap gap-2">
                    <button type="button" className="button" disabled={working} onClick={onWrite}>
                        Rewrite{price}
                    </button>
                    <button type="button" className="button button-quiet" disabled={working} onClick={onCancelRewrite}>
                        Keep mine
                    </button>
                </div>
            </div>
        );
    }
    return (
        <div className="flex flex-wrap gap-2">
            {canWrite && !hasText && (
                <button type="button" className="button" disabled={working} onClick={onWrite}>
                    {chapter.state === 'failed' ? 'Try again' : 'Write chapter'}
                    {price}
                </button>
            )}
            {canWrite && hasText && (
                <button
                    type="button"
                    className={chapter.outOfDate || chapter.state === 'failed' ? 'button' : 'button button-quiet'}
                    disabled={working}
                    onClick={chapter.writtenBy === 'user' ? onAskRewrite : onWrite}
                >
                    {chapter.state === 'failed' ? 'Try again' : 'Rewrite'}
                    {price}
                </button>
            )}
            {chapter.state !== 'empty' && (hasText || !chapter.chapterGone) && (
                <button type="button" className="button button-quiet" disabled={working} onClick={onEdit}>
                    Edit
                </button>
            )}
            {chapter.chapterGone && (
                <button type="button" className="button button-quiet" disabled={working} onClick={onRemove}>
                    Remove
                </button>
            )}
        </div>
    );
}

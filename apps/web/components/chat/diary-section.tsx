'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ConfirmButton } from '@/components/story-editor/fields';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { chatApi, DiaryEntry, formatWhen } from '@/lib/chat';

/** The Chat a profile is opened over, as far as the Diary needs it. */
export interface DiaryChat {
    storyId: number;
    chatId: number;
    /** The Chat's newest AI Message: a Character writes one entry there, then the story must go on. */
    newestAiMessageId: number | null;
}

type Loaded = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; entries: DiaryEntry[] };

/**
 * A Character's Diary in the Chat on screen (.scratch/diary/spec.md), in their profile: the entries
 * they wrote, newest first, and a button that asks for the next one. Read each time the profile
 * opens, so an entry a rewind took away is gone here too. One entry per moment: once the newest
 * tells of the Chat's newest reply, the button gives way to a line saying so.
 */
export function DiarySection({ chat, characterId, name }: { chat: DiaryChat; characterId: number; name: string }) {
    const { storyId, chatId, newestAiMessageId } = chat;
    const { reportUnreachable } = useConnection();
    const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
    const [writing, setWriting] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);
    const [showEarlier, setShowEarlier] = useState(false);
    const heading = useRef<HTMLHeadingElement>(null);
    const headingId = useId();

    const read = useCallback(async () => {
        setLoaded({ status: 'loading' });
        try {
            const { entries } = await chatApi.diary(storyId, chatId);
            setLoaded({ status: 'ready', entries: entries.filter((entry) => entry.characterId === characterId) });
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            setLoaded({ status: 'failed' });
        }
    }, [storyId, chatId, characterId, reportUnreachable]);

    useEffect(() => {
        void read();
    }, [read]);

    const fail = (caught: unknown, fallback: string) => {
        if (caught instanceof ApiUnreachableError) reportUnreachable();
        setProblem(caught instanceof ApiError ? caught.message : fallback);
    };

    const write = async () => {
        setWriting(true);
        setProblem(null);
        try {
            const entry = await chatApi.writeDiaryEntry(storyId, chatId, characterId);
            setLoaded((current) => ({ status: 'ready', entries: [entry, ...(current.status === 'ready' ? current.entries : [])] }));
        } catch (caught) {
            fail(caught, "Couldn't write the diary entry. Try again.");
        } finally {
            setWriting(false);
        }
    };

    const remove = async (entry: DiaryEntry) => {
        setProblem(null);
        try {
            await chatApi.deleteDiaryEntry(storyId, chatId, entry.id);
            setLoaded((current) => (current.status === 'ready' ? { status: 'ready', entries: current.entries.filter((other) => other.id !== entry.id) } : current));
        } catch (caught) {
            fail(caught, "Couldn't delete the entry. Try again.");
        }
    };

    const entries = loaded.status === 'ready' ? loaded.entries : [];
    // Newest first: the first is the one that says whether there is anything new to write about.
    const upToDate = entries.length > 0 && entries[0].messageId === newestAiMessageId;
    const shown = showEarlier ? entries : entries.slice(0, 1);
    const earlier = entries.length - 1;

    return (
        <section className="rounded-lg bg-surface-raised px-3.5 py-3" aria-labelledby={headingId}>
            <h3 id={headingId} ref={heading} tabIndex={-1} className="mt-0 mb-1 text-sm font-semibold text-muted focus:outline-none">
                Diary
            </h3>
            <p className="mt-0 mb-2.5 text-sm leading-normal text-muted">What {name} writes in private about the story so far, when you ask. Each entry uses credit like one reply.</p>

            {loaded.status === 'loading' && (
                <p role="status" className="m-0 text-sm text-muted motion-safe:animate-pulse-soft">
                    Opening the diary…
                </p>
            )}
            {loaded.status === 'failed' && (
                <p role="alert" className="turn-error">
                    Couldn&apos;t open the diary.{' '}
                    <button type="button" className="button button-quiet" onClick={() => void read()}>
                        Retry
                    </button>
                </p>
            )}

            {loaded.status === 'ready' &&
                (upToDate ? (
                    <p className="m-0 text-sm leading-normal text-muted">Up to date. Play on, then ask for the next entry.</p>
                ) : (
                    <button type="button" className="button button-small" disabled={writing} aria-busy={writing} onClick={() => void write()}>
                        {writing ? 'Writing…' : entries.length > 0 ? 'Write the next entry' : 'Write an entry'}
                    </button>
                ))}
            <p role="status" className={writing ? 'mt-2 mb-0 text-sm text-muted motion-safe:animate-pulse-soft' : 'sr-only'}>
                {writing ? `${name} is writing…` : ''}
            </p>
            {problem && (
                <p role="alert" className="turn-error">
                    {problem}
                </p>
            )}

            {shown.length > 0 && (
                <ol className="m-0 mt-3 flex list-none flex-col gap-3 p-0" aria-label={`${name}'s diary entries, newest first`}>
                    {shown.map((entry) => (
                        <li key={entry.id} className="border-l-3 border-(color:--speaker-colour) pl-3" data-diary-entry>
                            {/* The date keeps to one line: it broke in the middle, "Nov 16," over "2026, 7:41 AM" (docs/ui-audit-2026-11-16.md L3). */}
                            <p className="mt-0 mb-1 flex flex-wrap gap-x-2 text-sm text-muted">
                                {entry.moment ? <span className="font-semibold">{entry.moment}</span> : null}
                                <time className="whitespace-nowrap" dateTime={entry.createdAt}>
                                    {formatWhen(entry.createdAt)}
                                </time>
                            </p>
                            <p className="mt-0 mb-2 leading-normal whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.text}</p>
                            <ConfirmButton
                                label="Delete"
                                ariaLabel={`Delete the entry of ${formatWhen(entry.createdAt)}`}
                                danger
                                question="Delete this entry?"
                                confirmLabel="Delete"
                                onConfirm={() => remove(entry)}
                                focusAfter={() => heading.current}
                                disabled={writing}
                                busyLabel="Deleting…"
                                small
                            />
                        </li>
                    ))}
                </ol>
            )}
            {earlier > 0 && (
                <button type="button" className="button button-quiet button-small mt-3" aria-expanded={showEarlier} onClick={() => setShowEarlier((current) => !current)}>
                    {showEarlier ? 'Hide earlier entries' : `Show ${earlier} earlier ${earlier === 1 ? 'entry' : 'entries'}`}
                </button>
            )}
        </section>
    );
}

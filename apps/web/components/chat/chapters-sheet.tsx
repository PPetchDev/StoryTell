'use client';

import { useCallback, useEffect, useId, useState } from 'react';

import { useConnection } from '@/components/connection';
import { Loading } from '@/components/query-state';
import { Sheet } from '@/components/sheet/sheet';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { Chapter, Chapters, chaptersApi, defaultMoveTarget } from '@/lib/chapters';
import { Chat } from '@/lib/chat';
import { Scene } from '@/lib/story';

/** How often an open sheet reads the list again while a Chapter is being written. */
const WRITING_POLL_MS = 2_000;
/** The select's value for free play. */
const FREE_PLAY = 'free';

interface ChaptersSheetProps {
    chat: Chat;
    /** The Story's Scenes in order: where Move on may go. */
    scenes: Scene[];
    /** A turn or a write is in flight, or a Message is being edited: Move on waits. */
    busy: boolean;
    /** The Chat as the move left it, for the screen to show. */
    onMoved(chat: Chat): void;
    onClose(): void;
}

/** Plain words for what the user did or the AI is doing with one Chapter's summary. */
const STATUS_LINE: Record<Exclude<Chapter['status'], 'written'>, string> = {
    writing: 'Being written…',
    waiting: 'Not written yet: it’s written after one of the next turns.',
    failed: 'Couldn’t write this one.',
    empty: 'Nothing happened in this Scene.',
};

/**
 * Chapters (.scratch/scene-chapters/spec.md): every ended Scene of the Chat with its short summary,
 * which the user can read and edit, then the Chapter under way with Move on, which ends its Scene now
 * and goes to the next one, or to the one the user picks, or into free play.
 */
export function ChaptersSheet({ chat, scenes, busy, onMoved, onClose }: ChaptersSheetProps) {
    const { reportUnreachable } = useConnection();
    const [data, setData] = useState<Chapters | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
    const [working, setWorking] = useState(false);
    const currentSceneId = chat.currentScene?.id ?? null;
    const [target, setTarget] = useState<string>(() => targetValue(defaultMoveTarget(scenes, currentSceneId)));
    const selectId = useId();
    const currentHeadingId = useId();

    const fail = useCallback(
        (caught: unknown, fallback: string) => {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            setError(caught instanceof ApiError ? caught.message : fallback);
        },
        [reportUnreachable],
    );

    const load = useCallback(async () => {
        try {
            setData(await chaptersApi.list(chat.storyId, chat.id));
        } catch (caught) {
            fail(caught, 'Could not load the Chapters.');
        }
    }, [chat.storyId, chat.id, fail]);

    // Read again whenever the Chat changes: a turn may have ended a Scene.
    useEffect(() => {
        void load();
    }, [load, chat.currentScene?.id, chat.messages.length]);

    // A Chapter being written shows once it is.
    const writing = data?.chapters.some((chapter) => chapter.status === 'writing') ?? false;
    useEffect(() => {
        if (!writing) return;
        const timer = setTimeout(() => void load(), WRITING_POLL_MS);
        return () => clearTimeout(timer);
    }, [writing, data, load]);

    // The preselected Scene follows the Chat when it moves.
    useEffect(() => {
        setTarget(targetValue(defaultMoveTarget(scenes, currentSceneId)));
    }, [scenes, currentSceneId]);

    const run = async (work: () => Promise<void>, fallback: string) => {
        setWorking(true);
        setError(null);
        try {
            await work();
        } catch (caught) {
            fail(caught, fallback);
        } finally {
            setWorking(false);
        }
    };

    const moveOn = () =>
        run(async () => {
            const moved = await chaptersApi.moveOn(chat.storyId, chat.id, target === FREE_PLAY ? null : Number(target));
            onMoved(moved);
            setData(await chaptersApi.list(chat.storyId, chat.id));
        }, 'Could not move on.');

    const save = () =>
        run(async () => {
            if (!editing) return;
            setData(await chaptersApi.save(chat.storyId, chat.id, editing.id, editing.text));
            setEditing(null);
        }, 'Could not save the Chapter.');

    const retry = (chapter: Chapter) =>
        run(async () => setData(await chaptersApi.retry(chat.storyId, chat.id, chapter.id)), 'Could not write the Chapter.');

    // Every other Scene, then free play unless the Chat is in it.
    const targets = scenes.filter((scene) => scene.id !== currentSceneId);
    const current = data?.current;

    return (
        <Sheet label="Chapters" title="Chapters" onClose={onClose}>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-1">
                {error && (
                    <p role="alert" className="turn-error m-0">
                        {error}
                    </p>
                )}
                {!data ? (
                    !error && <Loading lines={3} label="Loading the Chapters…" />
                ) : (
                    <ol className="m-0 grid list-none gap-3 p-0" aria-label="Chapters">
                        {data.chapters.map((chapter) => (
                            <li key={chapter.id} className="grid gap-1.5 rounded-lg bg-bg px-3 py-2.5" data-chapter={chapter.number}>
                                <h3 className="m-0 text-sm font-semibold [overflow-wrap:anywhere]">
                                    Chapter {chapter.number} · {chapter.sceneName}
                                </h3>
                                {editing?.id === chapter.id ? (
                                    <div
                                        className="grid gap-2"
                                        onKeyDown={(event) => {
                                            if (event.key !== 'Escape' || working) return;
                                            event.stopPropagation();
                                            setEditing(null);
                                        }}
                                    >
                                        <div className="field my-0">
                                            <textarea
                                                aria-label={`Chapter ${chapter.number} summary`}
                                                rows={5}
                                                value={editing.text}
                                                disabled={working}
                                                onChange={(event) => setEditing({ id: chapter.id, text: event.target.value })}
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button type="button" className="button button-small" disabled={working || editing.text.trim() === ''} onClick={() => void save()}>
                                                Save
                                            </button>
                                            <button type="button" className="button button-quiet button-small" disabled={working} onClick={() => setEditing(null)}>
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {chapter.status === 'written' ? (
                                            <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{chapter.summary}</p>
                                        ) : (
                                            <p className="m-0 text-sm text-muted">{STATUS_LINE[chapter.status]}</p>
                                        )}
                                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                            <span className="min-w-0 text-sm text-muted">{chapterNote(chapter)}</span>
                                            <span className="flex gap-1">
                                                {chapter.status === 'failed' && (
                                                    <button type="button" className="button button-quiet button-small" disabled={working} onClick={() => void retry(chapter)}>
                                                        Try again
                                                    </button>
                                                )}
                                                {chapter.status !== 'writing' && chapter.status !== 'empty' && (
                                                    <button
                                                        type="button"
                                                        className="button button-quiet button-small"
                                                        aria-label={`Edit Chapter ${chapter.number}`}
                                                        disabled={working}
                                                        onClick={() => setEditing({ id: chapter.id, text: chapter.summary ?? '' })}
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                            </span>
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}
                        {current && (
                            <li className="grid gap-2 rounded-lg border border-line px-3 py-2.5" aria-labelledby={currentHeadingId} data-chapter="current">
                                <h3 id={currentHeadingId} className="m-0 text-sm font-semibold [overflow-wrap:anywhere]">
                                    Chapter {current.number} · {current.scene ? current.scene.name : 'Free play'} <span className="font-normal text-muted">(now)</span>
                                </h3>
                                <label htmlFor={selectId} className="text-sm font-semibold">
                                    Move on to
                                </label>
                                <select
                                    id={selectId}
                                    className="min-h-11 w-full min-w-0 rounded-sm border border-field-line bg-bg px-2.5 py-2 font-[inherit] text-text"
                                    value={target}
                                    disabled={working}
                                    onChange={(event) => setTarget(event.target.value)}
                                >
                                    {targets.map((scene) => (
                                        <option key={scene.id} value={String(scene.id)}>
                                            {scene.name}
                                        </option>
                                    ))}
                                    {currentSceneId !== null && <option value={FREE_PLAY}>Free play (no Scene)</option>}
                                </select>
                                <p className="m-0 text-sm text-muted">Ends this Scene now. Again on the newest reply takes it back.</p>
                                <button type="button" className="button justify-self-start" disabled={busy || working} onClick={() => void moveOn()}>
                                    Move on
                                </button>
                            </li>
                        )}
                    </ol>
                )}
            </div>
        </Sheet>
    );
}

function targetValue(sceneId: number | null): string {
    return sceneId === null ? FREE_PLAY : String(sceneId);
}

/** Who moved on and who wrote the summary, when it wasn't the AI's own doing. */
function chapterNote(chapter: Chapter): string {
    const notes: string[] = [];
    if (chapter.movedBy === 'user') notes.push('You moved on');
    if (chapter.writtenBy === 'user') notes.push('Edited by you');
    return notes.join(' · ');
}

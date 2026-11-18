'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';

import { announce } from '@/components/announcer';
import { ICON_BUTTON } from '@/components/chat/chat-classes';
import { useConnection } from '@/components/connection';
import { CloseIcon } from '@/components/icons';
import { Sheet } from '@/components/sheet/sheet';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import type { Chat, MessagePart } from '@/lib/chat';
import { followWatch, Watch, WATCH_CHOICES, watchApi, watchCostLine, watchEndedLine } from '@/lib/watch';

/** An eye: the story plays while you watch. */
export function EyeIcon({ size = 18, className }: { size?: number; className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            className={className}
        >
            <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
            <circle cx="12" cy="12" r="2.8" />
        </svg>
    );
}

export interface WatchControl {
    /** The Chat's Watch, running or ended by itself; null with none. */
    watch: Watch | null;
    running: boolean;
    /** The reply being written while Watch runs; null between replies. */
    replySoFar: MessagePart[] | null;
    /** How the last Watch ended by itself, until closed; null otherwise. */
    notice: string | null;
    /** Starts a Watch; answers the error to show, or null. */
    start(replies: number): Promise<string | null>;
    /** Stops the Watch and re-reads the Chat once its reply in progress has unwound. */
    stop(): Promise<void>;
    stopping: boolean;
    /** Lets go of the Watch here without asking the API: a send stops it there (.scratch/watch-mode/spec.md). */
    detach(): void;
    /** Closes the ended Watch's line, and forgets the Watch on the API. */
    dismiss(): void;
}

/**
 * Watch on the Chat screen (.scratch/watch-mode/spec.md): reads the Chat's Watch when it opens,
 * follows a running one's event stream (the reply as it is written, the count, the end), and
 * re-reads the Chat for each reply it adds, handing it to `onChat` (and `onReply`, for Auto-read).
 */
export function useWatch(storyId: number, chatId: number, onChat: (chat: Chat) => void, onReply?: (chat: Chat) => void): WatchControl {
    const { reportUnreachable } = useConnection();
    const [watch, setWatch] = useState<Watch | null>(null);
    const [replySoFar, setReplySoFar] = useState<MessagePart[] | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [stopping, setStopping] = useState(false);
    const follower = useRef<AbortController | null>(null);
    const onChatRef = useRef(onChat);
    const onReplyRef = useRef(onReply);
    useEffect(() => {
        onChatRef.current = onChat;
        onReplyRef.current = onReply;
    });

    const follow = useCallback(
        (from: Watch) => {
            follower.current?.abort();
            const controller = new AbortController();
            follower.current = controller;
            let done = from.done;
            let frame = 0;
            /** Counts the `parts` events, so a re-read never clears the reply that came after it. */
            let partsSeen = 0;
            const reread = (added: boolean) => {
                const seen = partsSeen;
                apiFetch<Chat>(`/stories/${storyId}/chats/${chatId}`).then(
                    (next) => {
                        if (controller.signal.aborted) return;
                        onChatRef.current(next);
                        if (partsSeen === seen) {
                            cancelAnimationFrame(frame);
                            setReplySoFar(null);
                        }
                        if (!added) return;
                        onReplyRef.current?.(next);
                        const reply = next.messages.at(-1);
                        const speakers = reply?.kind === 'ai' ? [...new Set(reply.parts.flatMap((part) => (part.kind === 'speech' ? [part.speakerName] : [])))] : [];
                        announce(speakers.length > 0 ? `Reply from ${speakers.join(', ')}.` : 'New reply.');
                    },
                    (caught: unknown) => {
                        if (caught instanceof ApiUnreachableError) reportUnreachable();
                    },
                );
            };
            void followWatch(storyId, chatId, controller.signal, {
                watch: (next) => {
                    if (controller.signal.aborted) return;
                    if (!next) {
                        setWatch(null);
                        setReplySoFar(null);
                        return;
                    }
                    setWatch(next);
                    const added = next.done > done;
                    done = next.done;
                    if (added || next.status === 'ended') reread(added);
                    if (next.status === 'ended') {
                        const line = watchEndedLine(next);
                        setNotice(line);
                        if (line) announce(line);
                    }
                },
                parts: (parts) => {
                    partsSeen++;
                    cancelAnimationFrame(frame);
                    // At most once a frame, as a turn's reply so far is drawn.
                    frame = requestAnimationFrame(() => {
                        if (!controller.signal.aborted) setReplySoFar(parts);
                    });
                },
            })
                .catch(() => {
                    // The Chat went, or the API refused: the next read of the Chat tells.
                })
                .finally(() => {
                    cancelAnimationFrame(frame);
                    if (follower.current === controller) follower.current = null;
                });
        },
        [storyId, chatId, reportUnreachable],
    );

    // The Chat's Watch when it opens: one running is followed, one that ended by itself says how.
    useEffect(() => {
        let cancelled = false;
        watchApi.state(storyId, chatId).then(
            (state) => {
                if (cancelled || !state.watch) return;
                setWatch(state.watch);
                if (state.watch.status === 'running') follow(state.watch);
                else setNotice(watchEndedLine(state.watch));
            },
            () => {
                // No Watch to show: play goes on as ever.
            },
        );
        return () => {
            cancelled = true;
            follower.current?.abort();
            follower.current = null;
        };
    }, [storyId, chatId, follow]);

    const start = async (replies: number): Promise<string | null> => {
        try {
            const started = await watchApi.start(storyId, chatId, replies);
            setNotice(null);
            setWatch(started);
            follow(started);
            announce(`Watching ${replies} replies.`);
            return null;
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            return caught instanceof ApiError ? caught.message : "Couldn't start watching.";
        }
    };

    const stop = async () => {
        follower.current?.abort();
        follower.current = null;
        setStopping(true);
        try {
            await watchApi.stop(storyId, chatId);
            announce('Stopped watching.');
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
        } finally {
            setStopping(false);
            setWatch(null);
            setReplySoFar(null);
            setNotice(null);
        }
        try {
            onChatRef.current(await apiFetch<Chat>(`/stories/${storyId}/chats/${chatId}`));
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
        }
    };

    const detach = () => {
        follower.current?.abort();
        follower.current = null;
        setWatch(null);
        setReplySoFar(null);
        setNotice(null);
    };

    const dismiss = () => {
        setNotice(null);
        setWatch(null);
        void watchApi.stop(storyId, chatId).catch(() => undefined);
    };

    const running = watch?.status === 'running';
    return { watch, running, replySoFar: running ? replySoFar : null, notice, start, stop, stopping, detach, dismiss };
}

interface WatchBandProps {
    control: WatchControl;
}

/**
 * Over the composer's tools while Watch runs: how far it has got, and Stop. Once it ended by
 * itself, how it ended, until closed. One row on a 320px phone: the words truncate before Stop.
 */
export function WatchBand({ control }: WatchBandProps) {
    const { watch, running, notice } = control;
    if (running && watch) {
        const at = Math.min(watch.done + 1, watch.replies);
        return (
            <div className="flex min-w-0 items-center gap-2 rounded-md bg-accent-soft pl-3 text-sm" role="group" aria-label="Watch" data-band="watch">
                <EyeIcon size={16} className="shrink-0 text-rewrite-text" />
                <span className="min-w-0 flex-1 truncate" aria-live="polite">
                    <span className="font-semibold text-rewrite-text">Watching</span> · {at} of {watch.replies}
                </span>
                <span
                    className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-surface max-[359px]:hidden"
                    role="progressbar"
                    aria-label="Replies watched"
                    aria-valuemin={0}
                    aria-valuemax={watch.replies}
                    aria-valuenow={watch.done}
                >
                    <span className="block h-full bg-accent-fill" style={{ width: `${(100 * watch.done) / watch.replies}%` }} />
                </span>
                <button
                    type="button"
                    className="bare-button inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-md font-semibold text-text press focus-ring disabled:cursor-not-allowed disabled:text-faint"
                    disabled={control.stopping}
                    onClick={() => void control.stop()}
                >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
                        <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
                    </svg>
                    {control.stopping ? 'Stopping…' : 'Stop'}
                </button>
            </div>
        );
    }
    if (!notice) return null;
    return (
        <div className="flex min-w-0 items-center gap-1 rounded-md bg-accent-soft pl-3 text-sm" data-band="watch-ended">
            <EyeIcon size={16} className="shrink-0 text-rewrite-text" />
            <p className="m-0 min-w-0 flex-1 truncate" title={notice}>
                {notice}
            </p>
            <button type="button" className={ICON_BUTTON} aria-label="Close" onClick={control.dismiss}>
                <CloseIcon size={18} />
            </button>
        </div>
    );
}

interface WatchSheetProps {
    storyId: number;
    chatId: number;
    identityName: string;
    onStart(replies: number): Promise<string | null>;
    onClose(): void;
}

/** A choice of how many replies: one of three segments, as Settings' Text size picks. */
const CHOICE = [
    'relative flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-field-line px-2 text-md font-semibold text-text',
    'has-checked:border-accent-fill has-checked:bg-accent-fill has-checked:text-accent-text not-has-checked:active:bg-surface-raised',
    'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
].join(' ');

/**
 * Starting Watch (.scratch/watch-mode/spec.md, "Web"): how many replies, what they will roughly cost
 * (from this Chat's own replies, as the Cost view counts them), and Start.
 */
export function WatchSheet({ storyId, chatId, identityName, onStart, onClose }: WatchSheetProps) {
    const [replies, setReplies] = useState<number>(5);
    const [perReplyUsd, setPerReplyUsd] = useState<number | null | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);
    const [starting, setStarting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        watchApi.state(storyId, chatId).then(
            (state) => {
                if (!cancelled) setPerReplyUsd(state.perReplyUsd);
            },
            () => {
                if (!cancelled) setPerReplyUsd(null);
            },
        );
        return () => {
            cancelled = true;
        };
    }, [storyId, chatId]);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (starting) return;
        setStarting(true);
        setError(null);
        const failure = await onStart(replies);
        if (failure) {
            setError(failure);
            setStarting(false);
            return;
        }
        onClose();
    };

    return (
        <Sheet label="Watch the story" onClose={onClose}>
            <form className="grid gap-3 px-1 pb-1" onSubmit={(event) => void submit(event)}>
                <h2 className="m-0 text-lg">Watch the story</h2>
                <p className="-mt-1 mb-0 text-md text-muted">
                    The Characters play on by themselves while {identityName} stays in the background. Stop at any time, or just write to step back in.
                </p>
                <fieldset className="m-0 grid gap-1.5 border-0 p-0">
                    <legend className="mb-1.5 p-0 text-md font-semibold">How many replies</legend>
                    <div className="grid grid-cols-3 gap-2">
                        {WATCH_CHOICES.map((choice) => (
                            <label key={choice} className={CHOICE}>
                                <input
                                    type="radio"
                                    name="watch-replies"
                                    value={choice}
                                    aria-label={`${choice} replies`}
                                    className="absolute inset-0 m-0 cursor-pointer opacity-0"
                                    checked={replies === choice}
                                    onChange={() => setReplies(choice)}
                                />
                                {choice}
                            </label>
                        ))}
                    </div>
                </fieldset>
                <p role="status" className="m-0 text-md text-muted" data-watch-cost>
                    {perReplyUsd === undefined ? 'Working out the cost…' : watchCostLine(perReplyUsd, replies)}
                </p>
                {error && (
                    <p role="alert" className="turn-error m-0">
                        {error}
                    </p>
                )}
                <button type="submit" className="button w-full" disabled={starting}>
                    {starting ? 'Starting…' : 'Start watching'}
                </button>
                <button type="button" className="button button-quiet w-full" onClick={onClose}>
                    Cancel
                </button>
            </form>
        </Sheet>
    );
}

'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { ACTION, ACTION_ICON, Spinner } from '@/components/chat/chat-classes';
import { PauseIcon, PlayIcon, StopIcon } from '@/components/icons';
import { readAloudApi, readAloudError, SpeechItem } from '@/lib/read-aloud';

export type PlayerState = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

/** What the player shows: the Message it reads, its state, the item being read, and why it stopped. */
export interface PlayerView {
    messageId: number | null;
    state: PlayerState;
    /** The item being read (loading, playing or paused), or the one that failed. */
    item: SpeechItem | null;
    /** "Couldn't read this aloud: …", while the state is `error`. */
    error: string | null;
    /** The browser refused to play without a tap: the Message offers "▶ Tap to play" instead of an error. */
    needsTap: boolean;
}

export interface ReadAloudPlayer extends PlayerView {
    /**
     * Reads a Message from its first item (or `from`: an item index, or a pick from the queue once it is
     * read, as the Visual novel view's ▶ does for the step on show), stopping any other first.
     */
    play(messageId: number, from?: number | ((items: SpeechItem[]) => number)): void;
    pause(): void;
    /** Carries on: from the paused place, or from the item that failed. */
    resume(): void;
    stop(): void;
    /**
     * Inside a tap (Send, Continue, Again, ▶): plays a silent clip on the player's audio element,
     * so iOS lets a later reply play by itself. Once per Chat screen; it never interrupts a reading.
     */
    unlock(): void;
}

/** A tenth of a second of silence: four silent MPEG frames. */
function silentClip(): Blob {
    const frame = new Uint8Array(104);
    frame.set([0xff, 0xfb, 0x10, 0xc0]);
    return new Blob([frame, frame, frame, frame], { type: 'audio/mpeg' });
}

const IDLE: PlayerView = { messageId: null, state: 'idle', item: null, error: null, needsTap: false };

/** One reading under way: its Message's queue, where it is, and the audio fetched so far. */
interface Run {
    messageId: number;
    items: SpeechItem[];
    index: number;
    abort: AbortController;
    audio: Map<number, Promise<Blob>>;
}

/**
 * The Chat screen's one player (.scratch/read-aloud/spec.md, "The player"). It holds one audio
 * element, the queue of the Message playing and where it is. It fetches item n + 1 while item n
 * plays. Starting a Message stops the one before; unmounting (leaving the Chat screen) stops it.
 * A failed item stops it with the error, and resume carries on from that item.
 */
export function useReadAloudPlayer(storyId: number, chatId: number): ReadAloudPlayer {
    const [view, setView] = useState<PlayerView>(IDLE);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const runRef = useRef<Run | null>(null);
    const urlRef = useRef<string | null>(null);
    const unlockedRef = useRef(false);
    /** False once the Chat screen is left: a turn that settles afterwards must not start a reading. */
    const aliveRef = useRef(true);

    const element = () => (audioRef.current ??= new Audio());

    const release = () => {
        const audio = audioRef.current;
        if (audio) {
            audio.onended = null;
            audio.onerror = null;
            audio.pause();
            audio.removeAttribute('src');
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
    };

    const stop = useCallback(() => {
        runRef.current?.abort.abort();
        runRef.current = null;
        release();
        setView(IDLE);
    }, []);

    const fetchItem = useCallback(
        (run: Run, index: number): Promise<Blob> => {
            let audio = run.audio.get(index);
            if (!audio) {
                audio = readAloudApi.item(storyId, chatId, run.messageId, index, run.abort.signal);
                run.audio.set(index, audio);
                // A failed fetch is asked again when its turn comes.
                audio.catch(() => run.audio.delete(index));
            }
            return audio;
        },
        [storyId, chatId],
    );

    const fail = (run: Run, caught: unknown) => {
        if (runRef.current !== run || run.abort.signal.aborted) return;
        release();
        const needsTap = caught instanceof DOMException && caught.name === 'NotAllowedError';
        setView({ messageId: run.messageId, state: 'error', item: run.items[run.index] ?? null, error: needsTap ? null : readAloudError(caught), needsTap });
    };

    const playItem = useCallback(
        async (run: Run, index: number) => {
            if (runRef.current !== run) return;
            run.index = index;
            const item = run.items[index];
            if (!item) {
                stop();
                return;
            }
            setView({ messageId: run.messageId, state: 'loading', item, error: null, needsTap: false });
            try {
                const blob = await fetchItem(run, index);
                if (runRef.current !== run) return;
                const audio = element();
                release();
                urlRef.current = URL.createObjectURL(blob);
                audio.src = urlRef.current;
                audio.onended = () => void playItem(run, index + 1);
                audio.onerror = () => fail(run, new Error("the audio couldn't be played."));
                await audio.play();
                if (runRef.current !== run) return;
                setView({ messageId: run.messageId, state: 'playing', item, error: null, needsTap: false });
                // The next item is made while this one plays.
                if (run.items[index + 1]) fetchItem(run, index + 1).catch(() => {});
            } catch (caught) {
                fail(run, caught);
            }
        },
        [fetchItem, stop],
    );

    const play = useCallback(
        (messageId: number, from: number | ((items: SpeechItem[]) => number) = 0) => {
            if (!aliveRef.current) return;
            stop();
            const run: Run = { messageId, items: [], index: typeof from === 'number' ? from : 0, abort: new AbortController(), audio: new Map() };
            runRef.current = run;
            setView({ messageId, state: 'loading', item: null, error: null, needsTap: false });
            readAloudApi.queue(storyId, chatId, messageId).then(
                (items) => {
                    if (runRef.current !== run) return;
                    run.items = items;
                    const start = typeof from === 'number' ? from : Math.max(0, from(items));
                    void playItem(run, Math.min(start, items.length));
                },
                (caught: unknown) => fail(run, caught),
            );
        },
        [storyId, chatId, stop, playItem],
    );

    const pause = useCallback(() => {
        if (!runRef.current) return;
        audioRef.current?.pause();
        setView((current) => (current.state === 'playing' ? { ...current, state: 'paused' } : current));
    }, []);

    const resume = useCallback(() => {
        const run = runRef.current;
        if (!run) return;
        if (view.state === 'paused') {
            const audio = element();
            audio.play().then(
                () => setView((current) => ({ ...current, state: 'playing' })),
                (caught: unknown) => fail(run, caught),
            );
            return;
        }
        // After a failure the queue is read again: the Message may have changed meanwhile. This is
        // a tap ("Try again", "▶ Tap to play"), so the element is primed inside it.
        if (view.state === 'error') {
            play(run.messageId, run.index);
            prime();
        }
    }, [view.state, play]);

    /**
     * Plays a silent clip on the player's element inside the current tap, so iOS lets the same
     * element play later without one. Called after any `stop()` in the same tap, which would cut
     * it off; a reading that starts meanwhile replaces its source and is left alone.
     */
    const prime = () => {
        const audio = element();
        if (!audio.paused) return;
        const url = URL.createObjectURL(silentClip());
        audio.src = url;
        const done = () => {
            URL.revokeObjectURL(url);
            if (audio.src === url) audio.removeAttribute('src');
        };
        audio.play().then(
            () => {
                unlockedRef.current = true;
                done();
            },
            // Refused or cut off: the next tap tries again, and a reply that can't play offers "▶ Tap to play".
            done,
        );
    };

    const unlock = useCallback(() => {
        if (!unlockedRef.current) prime();
    }, []);

    // Leaving the Chat screen stops the reading, and nothing starts one afterwards.
    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
            stop();
        };
    }, [stop]);

    return useMemo(() => ({ ...view, play, pause, resume, stop, unlock }), [view, play, pause, resume, stop, unlock]);
}

const PlayerContext = createContext<ReadAloudPlayer | null>(null);

/** Gives the thread (and later the Visual novel view) the Chat screen's player. */
export function ReadAloudProvider({ player, children }: { player: ReadAloudPlayer; children: ReactNode }) {
    return <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>;
}

export function useReadAloud(): ReadAloudPlayer | null {
    return useContext(PlayerContext);
}

/** The part being read in this Message, for its highlight; null when it isn't being read. */
export function useReadingNow(messageId: number): { partIndex: number; paragraph: number | null } | null {
    const player = useReadAloud();
    if (!player || player.messageId !== messageId || player.state === 'idle' || player.state === 'error' || !player.item) return null;
    return { partIndex: player.item.partIndex, paragraph: player.item.paragraph };
}

/** ▶ Read aloud, in the action row and a tapped Message's tools. Hidden while this Message is the one being read. */
export function ReadAloudAction({ messageId }: { messageId: number }) {
    const player = useReadAloud();
    if (!player || player.messageId === messageId) return null;
    return (
        <button
            type="button"
            className={ACTION}
            onClick={() => {
                // Unlocked after play() has stopped any reading, so the stop doesn't cut the silent clip off.
                player.play(messageId);
                player.unlock();
            }}
        >
            <PlayIcon size={16} className={ACTION_ICON} />
            Read aloud
        </button>
    );
}

/**
 * Under the Message being read: ❚❚ Pause or ▶ Resume, ■ Stop, and why it stopped when it failed.
 * While the audio loads, Pause waits with a turning arc (audit M25), not only a pulse.
 */
export function ReadAloudControls({ messageId }: { messageId: number }) {
    const player = useReadAloud();
    if (!player || player.messageId !== messageId || player.state === 'idle') return null;
    const { state } = player;
    return (
        <div className="mt-2 grid gap-1.5" role="group" aria-label="Reading aloud">
            {state === 'error' && player.error && (
                <p role="alert" className="m-0 text-md text-warning">
                    {player.error}
                </p>
            )}
            <div className="flex flex-wrap gap-2">
                {state === 'error' ? (
                    <button type="button" className={ACTION} onClick={player.resume}>
                        <PlayIcon size={16} className={ACTION_ICON} />
                        {player.needsTap ? 'Tap to play' : 'Try again'}
                    </button>
                ) : state === 'paused' ? (
                    <button type="button" className={ACTION} onClick={player.resume}>
                        <PlayIcon size={16} className={ACTION_ICON} />
                        Resume
                    </button>
                ) : (
                    <button type="button" className={ACTION} onClick={player.pause} disabled={state !== 'playing'} aria-busy={state === 'loading'}>
                        {state === 'loading' ? <Spinner /> : <PauseIcon size={16} className={ACTION_ICON} />}
                        Pause
                    </button>
                )}
                <button type="button" className={ACTION} onClick={player.stop}>
                    <StopIcon size={16} className={ACTION_ICON} />
                    Stop
                </button>
            </div>
        </div>
    );
}

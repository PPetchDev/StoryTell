import { apiFetch, apiSend, ApiUnreachableError, readJsonAnswer, serverSentEvents } from './api';
import type { MessagePart } from './chat';
import { replyUsd } from './reply-cost';

/** Why a Watch ended (.scratch/watch-mode/spec.md, "Stopping"). */
export type WatchEndReason = 'finished' | 'stopped' | 'ending' | 'sudden_event' | 'event_proposal' | 'roll_offer' | 'failed' | 'credit' | 'cap';

/** A Chat's Watch: the story playing on by itself for a number of replies. */
export interface Watch {
    id: string;
    replies: number;
    done: number;
    status: 'running' | 'ended';
    ended: { reason: WatchEndReason; message: string | null } | null;
    startedAt: string;
}

export interface WatchState {
    watch: Watch | null;
    /** What a reply of this Chat costs, from its last replies; null with none yet. */
    perReplyUsd: number | null;
}

/** The choices the Watch sheet offers. */
export const WATCH_CHOICES = [3, 5, 10] as const;

const watchPath = (storyId: number, chatId: number) => `/stories/${storyId}/chats/${chatId}/watch`;

export const watchApi = {
    state: (storyId: number, chatId: number) => apiFetch<WatchState>(watchPath(storyId, chatId)),
    start: (storyId: number, chatId: number, replies: number) => apiSend<Watch>('POST', watchPath(storyId, chatId), { replies }),
    /** Stops the Watch and forgets it; answers once its step has unwound. */
    stop: (storyId: number, chatId: number) => apiSend<void>('DELETE', watchPath(storyId, chatId)),
};

/** "about $0.0123 a reply · about $0.06 for 5", or what to say with no cost yet. */
export function watchCostLine(perReplyUsd: number | null, replies: number): string {
    if (perReplyUsd === null) return 'The cost shows once this Chat has a reply with a cost.';
    return `About ${replyUsd(perReplyUsd)} a reply · about ${replyUsd(perReplyUsd * replies)} for ${replies}`;
}

/** What the band says when a Watch ended by itself; null for the user's own Stop. */
export function watchEndedLine(watch: Watch): string | null {
    const ended = watch.ended;
    if (!ended || ended.reason === 'stopped') return null;
    const counted = `${watch.done} ${watch.done === 1 ? 'reply' : 'replies'}`;
    switch (ended.reason) {
        case 'finished':
            return `Watched ${counted}.`;
        case 'ending':
            return 'Watch stopped: the story reached an Ending.';
        case 'sudden_event':
            return 'Watch stopped: a Sudden event began.';
        case 'event_proposal':
            return 'Watch stopped: the story proposes an event.';
        case 'roll_offer':
            return "Watch stopped: you're offered a Roll.";
        default:
            return `Watch stopped: ${ended.message ?? 'something went wrong.'}`;
    }
}

export interface FollowHandlers {
    watch(watch: Watch | null): void;
    parts(parts: MessagePart[]): void;
}

/** The wait after a failed attempt; it doubles after each, up to MAX_BACKOFF_MS. */
const BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 8_000;
/** An open stream with no byte for this long is taken as dead (the API pings every 15 s). */
const SILENT_MS = 40_000;

/**
 * Follows a Watch's event stream until it has ended or `signal` aborts (.scratch/watch-mode/spec.md,
 * "Following"). Like a turn, it opens again when the stream breaks, when the page is visible again,
 * when the browser comes back online and when an open stream falls silent; before each attempt it
 * waits for the page to be visible and online. Nothing is lost between attempts: each begins with
 * the Watch as it is.
 */
export async function followWatch(storyId: number, chatId: number, signal: AbortSignal, handlers: FollowHandlers): Promise<void> {
    let attempt: AbortController | null = null;
    let nudged = false;
    const nudge = () => {
        if (!attempt || attempt.signal.aborted) return;
        nudged = true;
        attempt.abort();
    };
    let wasHidden = document.visibilityState === 'hidden';
    const onVisibility = () => {
        if (document.visibilityState === 'hidden') wasHidden = true;
        else if (wasHidden) {
            wasHidden = false;
            nudge();
        }
    };
    const onStop = () => attempt?.abort();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('offline', nudge);
    window.addEventListener('online', nudge);
    signal.addEventListener('abort', onStop);
    let failures = 0;
    try {
        while (!signal.aborted) {
            const current = new AbortController();
            attempt = current;
            nudged = false;
            let ended = false;
            let silence: ReturnType<typeof setTimeout> | undefined;
            const alive = () => {
                clearTimeout(silence);
                silence = setTimeout(() => current.abort(), SILENT_MS);
            };
            try {
                const response = await fetch(`/api${watchPath(storyId, chatId)}`, {
                    cache: 'no-store',
                    signal: current.signal,
                    headers: { Accept: 'text/event-stream' },
                });
                if (!(response.headers.get('content-type') ?? '').startsWith('text/event-stream') || !response.body) {
                    // An error the API answered (the Chat is gone): nothing more to follow.
                    await readJsonAnswer(response);
                    return;
                }
                alive();
                for await (const { event, data } of serverSentEvents(response.body, alive)) {
                    failures = 0;
                    if (signal.aborted) return;
                    if (event === 'watch') {
                        const watch = (data as { watch: Watch | null }).watch;
                        handlers.watch(watch);
                        if (!watch || watch.status === 'ended') ended = true;
                    } else if (event === 'parts') {
                        handlers.parts((data as { parts: MessagePart[] }).parts);
                    }
                }
            } catch (caught) {
                if (signal.aborted) return;
                if (!(caught instanceof ApiUnreachableError) && !(caught instanceof TypeError) && !(caught instanceof DOMException)) throw caught;
            } finally {
                clearTimeout(silence);
                attempt = null;
            }
            if (ended || signal.aborted) return;
            if (!nudged) failures++;
            if (failures > 0) await pause(Math.min(BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS), signal);
            await untilReachable(signal);
        }
    } finally {
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('offline', nudge);
        window.removeEventListener('online', nudge);
        signal.removeEventListener('abort', onStop);
    }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
        };
        const timer = setTimeout(done, ms);
        signal.addEventListener('abort', done);
    });
}

function untilReachable(signal: AbortSignal): Promise<void> {
    const ready = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
    if (ready() || signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
        const check = () => {
            if (!ready() && !signal.aborted) return;
            document.removeEventListener('visibilitychange', check);
            window.removeEventListener('online', check);
            signal.removeEventListener('abort', check);
            resolve();
        };
        document.addEventListener('visibilitychange', check);
        window.addEventListener('online', check);
        signal.addEventListener('abort', check);
    });
}

import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { MonthlyCapReachedError } from '../../errors/auth.errors.js';
import { OutOfCreditError } from '../../errors/model-gateway.errors.js';
import { WatchRunningError } from '../../errors/watch.errors.js';
import { errorResponse } from '../../filter/app-error.filter.js';
import { ChatManagerService } from '../../manager/chat/chat.service.js';
import { PushAlertsManagerService, WatchAlertOutcome } from '../../manager/push/push-alerts.service.js';
import { MessagePartResponse, untaggedPartResponse } from '../../model/chat/entities/message-part.entity.js';
import { LiveTurns } from './live-turns.js';

/** How long an ended Watch is still told to a client that comes back (.scratch/watch-mode/spec.md, "API"). */
export const ENDED_WATCH_KEPT_MS = 10 * 60_000;
/** The most replies one Watch writes. */
export const WATCH_REPLIES_MAX = 10;

/** Why a Watch ended (.scratch/watch-mode/spec.md, "Stopping"). */
export type WatchEndReason = 'finished' | 'stopped' | 'ending' | 'sudden_event' | 'event_proposal' | 'roll_offer' | 'failed' | 'credit' | 'cap';

/** A Watch as the client reads it. */
export interface WatchView {
    id: string;
    /** How many replies were asked for. */
    replies: number;
    /** How many are written and stored so far. */
    done: number;
    status: 'running' | 'ended';
    /** Why it ended, with the error's message for `failed`, `credit` and `cap`; null while it runs. */
    ended: { reason: WatchEndReason; message: string | null } | null;
    startedAt: string;
}

/** Someone following a Watch: the event stream of `GET …/watch`. */
export interface WatchListener {
    watch(view: WatchView): void;
    parts(parts: MessagePartResponse[]): void;
}

/** The reasons that leave the story waiting on the user: their alert says so. */
const NEEDS_YOU: ReadonlySet<WatchEndReason> = new Set(['ending', 'sudden_event', 'event_proposal', 'roll_offer']);

/** One Chat's Watch, while it runs and for a while after it ended. */
export class WatchRun {
    readonly id = randomUUID();
    readonly startedAt = new Date();
    done = 0;
    ended: WatchView['ended'] = null;
    /** The user asked it to stop: it ends at the next chance, its step stopped. */
    stopping = false;
    /** The live turn of the step being written, if one is. */
    turnId: string | undefined;
    /** Settles once the run has ended, however it ended. */
    readonly finished: Promise<void>;
    private settle: () => void = () => {};
    private readonly listeners = new Set<WatchListener>();

    constructor(
        readonly storyId: number,
        readonly chatId: number,
        readonly replies: number,
    ) {
        this.finished = new Promise((resolve) => (this.settle = resolve));
    }

    view(): WatchView {
        return {
            id: this.id,
            replies: this.replies,
            done: this.done,
            status: this.ended ? 'ended' : 'running',
            ended: this.ended,
            startedAt: this.startedAt.toISOString(),
        };
    }

    /** Follows the Watch from now on; the returned function stops following. */
    listen(listener: WatchListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    changed(): void {
        const view = this.view();
        for (const listener of this.listeners) listener.watch(view);
    }

    parts(parts: MessagePartResponse[]): void {
        for (const listener of this.listeners) listener.parts(parts);
    }

    end(reason: WatchEndReason, message: string | null): void {
        if (this.ended) return;
        this.ended = { reason, message };
        this.changed();
        this.listeners.clear();
        this.settle();
    }
}

/**
 * Watch (.scratch/watch-mode/spec.md): the story plays on by itself for a number of replies,
 * written by the API one after another, whatever happens to the client. Each step is a Continue
 * kept as a live turn, so it is stopped as ■ Stop stops a turn. In memory, by Chat, like the live
 * turns and the turn lock: the API is one process.
 */
@Injectable()
export class WatchRuns {
    private readonly logger = new Logger(WatchRuns.name);
    private readonly runs = new Map<number, WatchRun>();

    constructor(
        private readonly chatManager: ChatManagerService,
        private readonly turns: LiveTurns,
        private readonly pushAlerts: PushAlertsManagerService,
    ) {}

    /** The Chat's Watch, running or lately ended; undefined with none. */
    find(chatId: number): WatchRun | undefined {
        return this.runs.get(chatId);
    }

    /**
     * Starts a Watch of `replies` replies, refused as a Continue would be, and while one runs. The
     * run goes on in the request's own scope, so every step runs as its Account.
     */
    async start(storyId: number, chatId: number, replies: number): Promise<WatchView> {
        if (this.runs.get(chatId)?.ended === null) throw new WatchRunningError();
        await this.chatManager.assertCanWatch(storyId, chatId);
        // Read again: another start may have come in during the check.
        if (this.runs.get(chatId)?.ended === null) throw new WatchRunningError();
        const run = new WatchRun(storyId, chatId, replies);
        this.runs.set(chatId, run);
        void this.drive(run);
        return run.view();
    }

    /**
     * Stops the Chat's Watch, waiting for its step to unwind so the Chat read next is settled, and
     * forgets it. An ended one is forgotten; with none, nothing happens.
     */
    async stop(storyId: number, chatId: number): Promise<void> {
        const run = this.runs.get(chatId);
        if (!run) return;
        // Another Account's Chat, or another Story's, answers as not found and is left alone.
        await this.chatManager.requireChat(storyId, chatId);
        if (!run.ended) {
            run.stopping = true;
            if (run.turnId) await this.turns.stop(run.turnId, chatId);
            await run.finished;
        }
        if (this.runs.get(chatId) === run) this.runs.delete(chatId);
    }

    private async drive(run: WatchRun): Promise<void> {
        try {
            for (let n = 1; n <= run.replies; n++) {
                if (run.stopping) return this.end(run, 'stopped');
                const turn = this.turns.start(`watch-${run.id}-${n}`, run.chatId);
                run.turnId = turn.id;
                const unlisten = turn.listen({ parts: (parts) => run.parts(parts) });
                try {
                    const body = await this.chatManager.watchStep(run.storyId, run.chatId, {
                        signal: turn.stop.signal,
                        onStart: () => {},
                        onParts: (parts) => turn.setParts(parts.map(untaggedPartResponse)),
                    });
                    turn.finish({ event: 'done', body });
                } catch (error) {
                    if (turn.stop.signal.aborted || run.stopping) {
                        turn.finish({ event: 'stopped', body: {} });
                        return this.end(run, 'stopped');
                    }
                    const failure = errorResponse(error);
                    turn.finish({ event: 'error', body: failure.body });
                    const reason: WatchEndReason =
                        error instanceof OutOfCreditError ? 'credit' : error instanceof MonthlyCapReachedError ? 'cap' : 'failed';
                    return this.end(run, reason, failure.body.error.message);
                } finally {
                    unlisten();
                    run.turnId = undefined;
                }
                run.done = n;
                run.changed();
                // The Judge's word on the reply decides whether the story needs the user now.
                await this.chatManager.replyCallsSettled(run.chatId);
                if (run.stopping) return this.end(run, 'stopped');
                const needs = await this.chatManager.watchNeedsUser(run.storyId, run.chatId);
                if (needs) return this.end(run, needs);
            }
            return this.end(run, 'finished');
        } catch (error) {
            this.logger.warn(`Chat ${run.chatId}: Watch failed: ${error instanceof Error ? error.message : String(error)}`);
            return this.end(run, 'failed', errorResponse(error).body.error.message);
        }
    }

    private async end(run: WatchRun, reason: WatchEndReason, message: string | null = null): Promise<void> {
        run.end(reason, message);
        setTimeout(() => {
            if (this.runs.get(run.chatId) === run) this.runs.delete(run.chatId);
        }, ENDED_WATCH_KEPT_MS).unref();
        if (reason === 'stopped') return;
        const outcome: WatchAlertOutcome = reason === 'finished' ? 'finished' : NEEDS_YOU.has(reason) ? 'needs_you' : 'stopped';
        try {
            const chat = await this.chatManager.getChat(run.storyId, run.chatId);
            this.pushAlerts.watchEnded({ storyId: run.storyId, chatId: run.chatId, chatTitle: chat.title, outcome });
        } catch (error) {
            // The Chat was deleted meanwhile: no one to tell.
            this.logger.warn(`Chat ${run.chatId}: no Watch alert: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

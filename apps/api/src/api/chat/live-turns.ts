import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { ErrorResponseBody } from '../../filter/app-error.filter.js';
import type { MessagePartResponse } from '../../model/chat/entities/message-part.entity.js';

/** How long an ended turn can still be resumed (.scratch/resume-reply/spec.md, "Live turns"). */
export const ENDED_TURN_KEPT_MS = 10 * 60_000;
/** The longest a Stop waits for its turn to unwind before it answers anyway. */
const STOP_WAIT_MS = 10_000;
/** A turn id the client may choose: short, and safe in a path. */
const TURN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** How a turn ended: the body its request answers, its error, or a Stop. */
export type TurnEnd = { event: 'done'; body: unknown } | { event: 'error'; body: ErrorResponseBody } | { event: 'stopped'; body: Record<string, never> };

/** Someone following a turn: its own request, or a resume. */
export interface TurnListener {
    parts(parts: MessagePartResponse[]): void;
    end?(end: TurnEnd): void;
}

/**
 * One streamed turn, from the moment its request arrives until it ends: the reply so far, and
 * how it ended. Its request closing does not end it; only the turn's own end or a Stop does.
 */
export class LiveTurn {
    /** Aborted by a Stop: the turn then fails down its usual failure path. */
    readonly stop = new AbortController();
    /** The latest `parts`: the whole reply so far, as the client is sent it. */
    parts: MessagePartResponse[] | undefined;
    end: TurnEnd | undefined;
    /** Settles once the turn has ended, however it ended. */
    readonly ended: Promise<void>;
    private settle: () => void = () => {};
    private readonly listeners = new Set<TurnListener>();

    constructor(
        readonly id: string,
        readonly chatId: number,
    ) {
        this.ended = new Promise((resolve) => (this.settle = resolve));
    }

    setParts(parts: MessagePartResponse[]): void {
        if (this.end) return;
        this.parts = parts;
        for (const listener of this.listeners) listener.parts(parts);
    }

    finish(end: TurnEnd): void {
        if (this.end) return;
        this.end = end;
        for (const listener of this.listeners) listener.end?.(end);
        this.listeners.clear();
        this.settle();
    }

    /** Follows the turn from now on; the returned function stops following. */
    listen(listener: TurnListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

/**
 * The streamed turns the API is writing, or ended lately, by the id the client gave them
 * (.scratch/resume-reply/spec.md). In memory, as the turn lock is: the API is one process.
 */
@Injectable()
export class LiveTurns {
    private readonly turns = new Map<string, LiveTurn>();

    /** The client's turn id when it is one we take, else a new one. */
    idOf(header: string | string[] | undefined): string {
        const id = Array.isArray(header) ? header[0] : header;
        return id !== undefined && TURN_ID.test(id) ? id : randomUUID();
    }

    /** The turn of this Chat with this id, while it runs or is kept after its end. */
    find(id: string, chatId: number): LiveTurn | undefined {
        const turn = this.turns.get(id);
        return turn?.chatId === chatId ? turn : undefined;
    }

    /**
     * Keeps a new turn under `id`. The Chat's ended turns go: only its latest can be resumed.
     * An id already in use for another Chat is replaced by a new one.
     */
    start(id: string, chatId: number): LiveTurn {
        const key = this.turns.has(id) ? randomUUID() : id;
        for (const [other, turn] of this.turns) {
            if (turn.chatId === chatId && turn.end) this.turns.delete(other);
        }
        const turn = new LiveTurn(key, chatId);
        this.turns.set(key, turn);
        void turn.ended.then(() => {
            setTimeout(() => {
                if (this.turns.get(key) === turn) this.turns.delete(key);
            }, ENDED_TURN_KEPT_MS).unref();
        });
        return turn;
    }

    /**
     * Stops a running turn and waits for it to unwind, so the Chat read next is settled. A turn
     * that ended, or one we don't know, is left as it is.
     */
    async stop(id: string, chatId: number): Promise<void> {
        const turn = this.find(id, chatId);
        if (!turn || turn.end) return;
        turn.stop.abort();
        let timer: NodeJS.Timeout | undefined;
        await Promise.race([turn.ended, new Promise<void>((resolve) => (timer = setTimeout(resolve, STOP_WAIT_MS)))]);
        clearTimeout(timer);
    }
}

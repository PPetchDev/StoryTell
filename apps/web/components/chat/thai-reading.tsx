'use client';

import { useState } from 'react';

import { withActions } from '@/components/chat/message-body';
import { useConnection } from '@/components/connection';
import { ApiUnreachableError } from '@/lib/api';
import { chatApi, Message } from '@/lib/chat';

import styles from './chat-thread.module.css';

/** What ไทย shows for one Message besides its stored reading: hidden for this visit, being asked, or failed. */
export interface ThaiReadings {
    /** Whether the reading of this Message shows: it has one and it isn't hidden. */
    shown(message: Message): boolean;
    busy(messageId: number): boolean;
    failed(messageId: number): boolean;
    /** With no reading, asks for one; with one, hides or shows it with no call. */
    toggle(message: Message): void;
    /** Asks again after a failure. */
    retry(messageId: number): void;
}

const without = (set: Set<number>, id: number) => new Set([...set].filter((other) => other !== id));

/**
 * .scratch/write-for-me/spec.md, "Thai reading", web. Readings the Chat returns show by default;
 * hiding is per Message for this visit only. A new reading is put on its Message in place, with
 * no Chat reload.
 */
export function useThaiReadings(storyId: number, chatId: number, onReading: (messageId: number, text: string) => void): ThaiReadings {
    const { reportUnreachable } = useConnection();
    const [hidden, setHidden] = useState<Set<number>>(new Set());
    const [busy, setBusy] = useState<Set<number>>(new Set());
    const [failed, setFailed] = useState<Set<number>>(new Set());

    const ask = async (messageId: number) => {
        setBusy((current) => new Set(current).add(messageId));
        setFailed((current) => without(current, messageId));
        try {
            const { text } = await chatApi.thaiReading(storyId, chatId, messageId);
            setHidden((current) => without(current, messageId));
            onReading(messageId, text);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setFailed((current) => new Set(current).add(messageId));
        } finally {
            setBusy((current) => without(current, messageId));
        }
    };

    return {
        shown: (message) => message.thaiReading !== null && !hidden.has(message.id),
        busy: (messageId) => busy.has(messageId),
        failed: (messageId) => failed.has(messageId),
        toggle: (message) => {
            if (busy.has(message.id)) return;
            if (message.thaiReading === null) return void ask(message.id);
            setHidden((current) => (current.has(message.id) ? without(current, message.id) : new Set(current).add(message.id)));
        },
        retry: (messageId) => {
            if (!busy.has(messageId)) void ask(messageId);
        },
    };
}

/** ไทย, a Message action: pressed while its reading shows, busy while one is asked for. */
export function ThaiReadingAction({ message, readings }: { message: Message; readings: ThaiReadings }) {
    const busy = readings.busy(message.id);
    return (
        <button
            type="button"
            className={styles.action}
            aria-label="Thai reading"
            title="Thai reading"
            aria-pressed={readings.shown(message)}
            aria-busy={busy}
            onClick={() => readings.toggle(message)}
        >
            <span lang="th">ไทย</span>
        </button>
    );
}

/**
 * Under the Message's story text, above its Snapshots and actions: the wait, the reading, set
 * apart, or the failure with Retry. The wait and the failure show here, by the Message, because ไทย
 * may be in the "⋯" menu, which closes on the tap. One block for all parts, so `*…*` spans read in
 * italics everywhere, as speech shows them.
 */
export function ThaiReadingBlock({ message, readings }: { message: Message; readings: ThaiReadings }) {
    if (readings.busy(message.id) && message.thaiReading === null) {
        return (
            <p role="status" className={styles.thaiPending}>
                Making a Thai reading…
            </p>
        );
    }
    if (readings.failed(message.id) && message.thaiReading === null) {
        return (
            <p role="alert" className="turn-error">
                Couldn&apos;t make a Thai reading, try again{' '}
                <button type="button" className="button button-quiet" onClick={() => readings.retry(message.id)}>
                    Retry
                </button>
            </p>
        );
    }
    if (!readings.shown(message) || message.thaiReading === null) return null;
    return (
        <section className={styles.thaiReading} aria-label="Thai reading" lang="th">
            <span className={styles.thaiLabel} aria-hidden="true">
                ไทย
            </span>
            <p className={styles.thaiText}>{withActions(message.thaiReading)}</p>
        </section>
    );
}

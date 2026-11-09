'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { MessageBody } from '@/components/chat/message-body';
import { useConnection } from '@/components/connection';
import { Sheet } from '@/components/sheet/sheet';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { Cast, Portraits } from '@/lib/character-colour';
import { AiMessage, MessagePart } from '@/lib/chat';
import { storyApi } from '@/lib/story';
import styles from './opening-preview.module.css';

type Preview = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; parts: MessagePart[] };

interface OpeningPreviewProps {
    storyId: number;
    cast: Cast;
    portraits: Portraits;
    playable: boolean;
    /** Sends the author's pending edits first, so the preview shows what they just typed. */
    flush(): Promise<void>;
    onPlay(): void;
    onClose(): void;
}

/** The Opening as a Chat's first Message, so the parts render exactly as they will in play. */
function asMessage(parts: MessagePart[]): AiMessage {
    return { id: 0, kind: 'ai', model: 'author', parts, judge: null, memory: null, versions: null, createdAt: '', thaiReading: null };
}

/**
 * The Opening preview (spec: "Story editor", Opening preview): the stored Opening, split by the
 * Chat's parser on the API and drawn by the Chat's Message rendering, plus Play.
 */
export function OpeningPreview({ storyId, cast, portraits, playable, flush, onPlay, onClose }: OpeningPreviewProps) {
    const { reportUnreachable } = useConnection();
    const [preview, setPreview] = useState<Preview>({ kind: 'loading' });
    /** Counts loads; only the latest one's answer is shown, and none after the sheet closes. */
    const latest = useRef(0);

    const load = useCallback(async () => {
        const attempt = ++latest.current;
        setPreview({ kind: 'loading' });
        try {
            await flush();
            const { parts } = await storyApi.opening(storyId);
            if (attempt === latest.current) setPreview({ kind: 'ready', parts });
        } catch (error) {
            if (attempt !== latest.current) return;
            if (error instanceof ApiUnreachableError) reportUnreachable();
            else setPreview({ kind: 'error', message: error instanceof ApiError ? error.message : 'Something went wrong.' });
        }
    }, [flush, reportUnreachable, storyId]);

    useEffect(() => {
        void load();
        return () => {
            latest.current += 1;
        };
    }, [load]);

    return (
        <Sheet label="Opening preview" onClose={onClose}>
            <p className={styles.kicker}>How every Chat begins</p>
            {preview.kind === 'loading' && <p className="muted">Loading…</p>}
            {preview.kind === 'error' && (
                <p role="alert" className={styles.error}>
                    Couldn&apos;t show the preview: {preview.message}{' '}
                    <button type="button" className="button button-quiet button-small" onClick={() => void load()}>
                        Retry
                    </button>
                </p>
            )}
            {preview.kind === 'ready' &&
                (preview.parts.length === 0 ? (
                    <p className="muted">The Opening is empty. Write it on the Story tab.</p>
                ) : (
                    <div className={styles.thread}>
                        <MessageBody message={asMessage(preview.parts)} cast={cast} portraits={portraits} />
                    </div>
                ))}
            {!playable && <p className={styles.waiting}>Fill in the missing fields to play.</p>}
            <button type="button" className={`button ${styles.play}`} disabled={!playable} onClick={onPlay}>
                ▶ Play
            </button>
        </Sheet>
    );
}

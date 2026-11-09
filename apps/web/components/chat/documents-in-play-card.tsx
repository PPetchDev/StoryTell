'use client';

import { useEffect, useId, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { DocumentsInPlay, documentsApi } from '@/lib/documents';

import styles from './story-so-far-card.module.css';

interface DocumentsInPlayCardProps {
    storyId: number;
    chatId: number;
    /** Bumped when the Chat changes, so the card reads the latest. */
    version?: number;
}

/**
 * Documents in play, in the Memory drawer under Lore in play (.scratch/documents/spec.md):
 * the passages the last turn found in the Story's Documents, so the user can tell retrieval
 * works, or that its search failed. Shown only when the Story has Documents. Reading it never
 * searches, so it costs nothing.
 */
export function DocumentsInPlayCard({ storyId, chatId, version }: DocumentsInPlayCardProps) {
    const { reportUnreachable } = useConnection();
    const titleId = useId();
    const [data, setData] = useState<DocumentsInPlay | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        documentsApi.inPlay(storyId, chatId).then(
            (loaded) => {
                if (cancelled) return;
                setData(loaded);
                setError(null);
            },
            (caught: unknown) => {
                if (cancelled) return;
                if (caught instanceof ApiUnreachableError) reportUnreachable();
                else setError(caught instanceof ApiError ? caught.message : 'Could not load the Documents in play.');
            },
        );
        return () => {
            cancelled = true;
        };
    }, [storyId, chatId, version, reportUnreachable]);

    if (!error && !data?.hasDocuments) return null;
    return (
        <section className={styles.card} aria-labelledby={titleId}>
            <h3 id={titleId} className={styles.title}>
                Documents in play
            </h3>
            {error && (
                <p role="alert" className="turn-error">
                    {error}
                </p>
            )}
            {data &&
                (data.status === 'failed' ? (
                    <p className="muted small">The last turn&apos;s search failed, so it used no Documents.</p>
                ) : data.status === 'none' ? (
                    <p className="muted small">No turn has looked in the Documents yet.</p>
                ) : data.passages.length === 0 ? (
                    <p className="muted small">None close enough to the last turn.</p>
                ) : (
                    <ul className={styles.list} aria-label="Document passages in play">
                        {data.passages.map((passage) => (
                            <li key={`${passage.documentId}:${passage.position}`}>
                                <strong>{passage.documentTitle.trim() || 'Untitled'}</strong>
                                <span className="muted small"> · {passage.excerpt}</span>
                            </li>
                        ))}
                    </ul>
                ))}
        </section>
    );
}

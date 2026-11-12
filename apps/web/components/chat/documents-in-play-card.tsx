'use client';

import { useEffect, useId, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { DocumentsInPlay, documentsApi } from '@/lib/documents';

import { DRAWER_CARD, DRAWER_CARD_LIST, DRAWER_CARD_TITLE } from './card-look';

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

    // While it loads it says so, like the Lore card, rather than appearing later and pushing the drawer down (audit L37).
    if (data && !error && !data.hasDocuments) return null;
    return (
        <section className={DRAWER_CARD} aria-labelledby={titleId}>
            <h3 id={titleId} className={DRAWER_CARD_TITLE}>
                Documents in play
            </h3>
            {error && (
                <p role="alert" className="turn-error mt-0 mb-3">
                    {error}
                </p>
            )}
            {!data && !error && <p className="mt-0 mb-3 text-sm text-muted">Loading…</p>}
            {data &&
                (data.status === 'failed' ? (
                    <p className="mt-0 mb-3 text-sm text-muted">The last turn&apos;s search failed, so it used no Documents.</p>
                ) : data.status === 'none' ? (
                    <p className="mt-0 mb-3 text-sm text-muted">No turn has looked in the Documents yet.</p>
                ) : data.passages.length === 0 ? (
                    <p className="mt-0 mb-3 text-sm text-muted">None close enough to the last turn.</p>
                ) : (
                    <ul className={DRAWER_CARD_LIST} aria-label="Document passages in play">
                        {data.passages.map((passage) => (
                            <li key={`${passage.documentId}:${passage.position}`}>
                                <strong>{passage.documentTitle.trim() || 'Untitled'}</strong>
                                <span className="text-sm text-muted"> · {passage.excerpt}</span>
                            </li>
                        ))}
                    </ul>
                ))}
        </section>
    );
}

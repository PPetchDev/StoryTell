'use client';

import { useEffect, useId, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { inPlayWords, leftOutWords, LoreInPlay, loreApi } from '@/lib/lore';

import styles from './story-so-far-card.module.css';

interface LoreInPlayCardProps {
    storyId: number;
    chatId: number;
    /** Bumped when the Chat changes, so the card reads the latest. */
    version?: number;
}

/**
 * The Lore in play, in the Memory drawer (spec: "Lore in play"): the Story's Lore entries the
 * story is using right now, so the user can tell a keyword works. Read only: Lore is edited in
 * the Story editor. Each entry says why it is in, and the entries that came up but were left out
 * fold away under them (.scratch/lore-triggers/spec.md: "Lore in play").
 */
export function LoreInPlayCard({ storyId, chatId, version }: LoreInPlayCardProps) {
    const { reportUnreachable } = useConnection();
    const titleId = useId();
    const [data, setData] = useState<LoreInPlay | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        loreApi.inPlay(storyId, chatId).then(
            (loaded) => {
                if (cancelled) return;
                setData(loaded);
                setError(null);
            },
            (caught: unknown) => {
                if (cancelled) return;
                if (caught instanceof ApiUnreachableError) reportUnreachable();
                else setError(caught instanceof ApiError ? caught.message : 'Could not load the Lore in play.');
            },
        );
        return () => {
            cancelled = true;
        };
    }, [storyId, chatId, version, reportUnreachable]);

    return (
        <section className={styles.card} aria-labelledby={titleId}>
            <h3 id={titleId} className={styles.title}>
                Lore in play
            </h3>
            {error && (
                <p role="alert" className="turn-error">
                    {error}
                </p>
            )}
            {!data ? (
                !error && <p className="muted small">Loading…</p>
            ) : (
                <>
                    {data.entries.length === 0 ? (
                        <p className="muted small">None right now. An entry comes into play when its name or a keyword comes up.</p>
                    ) : (
                        <ul className={styles.list} aria-label="Lore entries in play">
                            {data.entries.map((entry) => (
                                <li key={entry.id}>
                                    {entry.name.trim() || 'Untitled'}
                                    <span className="muted small">
                                        {' '}
                                        · {inPlayWords(entry.why)}
                                        {entry.chance < 100 && ` · ${entry.chance}% chance`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {data.leftOut.length > 0 && (
                        <details className={styles.leftOut}>
                            <summary>Came up but left out ({data.leftOut.length})</summary>
                            <ul className={styles.list} aria-label="Lore entries left out">
                                {data.leftOut.map((entry) => (
                                    <li key={entry.id}>
                                        {entry.name.trim() || 'Untitled'}
                                        <span className="muted small"> · {leftOutWords(entry.why)}</span>
                                    </li>
                                ))}
                            </ul>
                        </details>
                    )}
                </>
            )}
        </section>
    );
}

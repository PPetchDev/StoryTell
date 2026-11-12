'use client';

import { useEffect, useId, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { inPlayWords, leftOutWords, LoreInPlay, loreApi } from '@/lib/lore';

import { DRAWER_CARD, DRAWER_CARD_LIST, DRAWER_CARD_TITLE } from './card-look';
import { Summary } from './disclosure';

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
        <section className={DRAWER_CARD} aria-labelledby={titleId}>
            <h3 id={titleId} className={DRAWER_CARD_TITLE}>
                Lore in play
            </h3>
            {error && (
                <p role="alert" className="turn-error mt-0 mb-3">
                    {error}
                </p>
            )}
            {!data ? (
                !error && <p className="mt-0 mb-3 text-sm text-muted">Loading…</p>
            ) : (
                <>
                    {data.entries.length === 0 ? (
                        <p className="mt-0 mb-3 text-sm text-muted">None right now. An entry comes into play when its name or a keyword comes up.</p>
                    ) : (
                        <ul className={DRAWER_CARD_LIST} aria-label="Lore entries in play">
                            {data.entries.map((entry) => (
                                <li key={entry.id}>
                                    {entry.name.trim() || 'Untitled'}
                                    <span className="text-sm text-muted">
                                        {' '}
                                        · {inPlayWords(entry.why)}
                                        {entry.chance < 100 && ` · ${entry.chance}% chance`}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {data.leftOut.length > 0 && (
                        <details className="group mt-0 mb-3">
                            <Summary className="text-md text-muted">Came up but left out ({data.leftOut.length})</Summary>
                            <ul className="mt-1.5 mb-0 pl-5" aria-label="Lore entries left out">
                                {data.leftOut.map((entry) => (
                                    <li key={entry.id}>
                                        {entry.name.trim() || 'Untitled'}
                                        <span className="text-sm text-muted"> · {leftOutWords(entry.why)}</span>
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

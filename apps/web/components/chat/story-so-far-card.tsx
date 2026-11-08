'use client';

import { useEffect, useId, useState } from 'react';

import { useConnection } from '@/components/connection';
import { FoldTitle } from '@/components/fold/fold-button';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { useFolded } from '@/lib/folds';
import { StorySoFar, storySoFarApi } from '@/lib/story-so-far';

import styles from './story-so-far-card.module.css';

/** One fold for every Chat: the user wants the Story so far either in view or out of the way. */
const FOLD_KEY = 'storySoFar';

interface StorySoFarCardProps {
    storyId: number;
    chatId: number;
    /** Bumped when the Chat changes, so the card reads the latest. */
    version?: number;
}

/**
 * The Story so far in the Memory drawer (spec: "Story so far", Web): the account the AI reads
 * in place of the Chat's oldest Messages, how many it covers and who wrote it, with an edit
 * the user saves. Nothing while the whole Chat still fits. It folds, and stays folded on this
 * device until it is unfolded.
 */
export function StorySoFarCard({ storyId, chatId, version }: StorySoFarCardProps) {
    const { reportUnreachable } = useConnection();
    const titleId = useId();
    const bodyId = useId();
    const folded = useFolded(FOLD_KEY);
    const [data, setData] = useState<StorySoFar | null>(null);
    const [draft, setDraft] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        storySoFarApi.get(storyId, chatId).then(
            (loaded) => !cancelled && setData(loaded),
            (caught: unknown) => {
                if (cancelled) return;
                if (caught instanceof ApiUnreachableError) reportUnreachable();
                else setError(caught instanceof ApiError ? caught.message : 'Could not load the Story so far.');
            },
        );
        return () => {
            cancelled = true;
        };
    }, [storyId, chatId, version, reportUnreachable]);

    const save = async () => {
        if (draft === null) return;
        setSaving(true);
        setError(null);
        try {
            setData(await storySoFarApi.save(storyId, chatId, draft));
            setDraft(null);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            setError(caught instanceof ApiError ? caught.message : 'Could not save the Story so far.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className={styles.card} aria-labelledby={titleId}>
            <FoldTitle foldKey={FOLD_KEY} controls={bodyId} id={titleId}>
                Story so far
            </FoldTitle>
            <div id={bodyId} hidden={folded} className={styles.body}>
                {error && (
                    <p role="alert" className="turn-error">
                        {error}
                    </p>
                )}
                {!data ? (
                    !error && <p className="muted small">Loading…</p>
                ) : data.text === null ? (
                    <p className="muted small">Not needed yet: the whole Chat still fits.</p>
                ) : draft !== null ? (
                    <div className={styles.form}>
                        <textarea
                            aria-label="Story so far text"
                            rows={8}
                            value={draft}
                            disabled={saving}
                            onChange={(event) => setDraft(event.target.value)}
                        />
                        <p className="muted small">Your version wins: later updates keep what you write here.</p>
                        <div className={styles.actions}>
                            <button type="button" className="button button-small" disabled={saving || draft.trim() === ''} onClick={() => void save()}>
                                Save
                            </button>
                            <button type="button" className="button button-quiet button-small" disabled={saving} onClick={() => setDraft(null)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p className={styles.text}>{data.text}</p>
                        <div className={styles.meta}>
                            <span className="muted small">
                                Covers the first {data.coveredMessages} {data.coveredMessages === 1 ? 'Message' : 'Messages'} · Written by{' '}
                                {data.writtenBy === 'user' ? 'you' : 'the AI'}
                            </span>
                            <button type="button" className="button button-quiet button-small" onClick={() => setDraft(data.text ?? '')}>
                                Edit
                            </button>
                        </div>
                    </>
                )}
                {data?.failedReason && (
                    <p className="muted small">Couldn’t update it just now. It tries again after the next turn.</p>
                )}
            </div>
        </section>
    );
}

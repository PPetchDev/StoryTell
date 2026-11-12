'use client';

import { useEffect, useId, useState } from 'react';

import { useConnection } from '@/components/connection';
import { FoldTitle } from '@/components/fold/fold-button';
import { Loading } from '@/components/query-state';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { useFolded } from '@/lib/folds';
import { StorySoFar, storySoFarApi } from '@/lib/story-so-far';

import { DRAWER_CARD } from './card-look';

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
        <section className={DRAWER_CARD} aria-labelledby={titleId}>
            <FoldTitle foldKey={FOLD_KEY} controls={bodyId} id={titleId}>
                Story so far
            </FoldTitle>
            <div id={bodyId} hidden={folded} className="pt-0.5 pb-3">
                {error && (
                    <p role="alert" className="turn-error my-2">
                        {error}
                    </p>
                )}
                {!data ? (
                    !error && <Loading lines={2} label="Loading the Story so far…" />
                ) : data.text === null ? (
                    <p className="my-2 text-sm text-muted">Not needed yet: the whole Chat still fits.</p>
                ) : draft !== null ? (
                    <div
                        className="grid gap-2"
                        onKeyDown={(event) => {
                            if (event.key !== 'Escape' || saving) return;
                            event.stopPropagation();
                            setDraft(null);
                        }}
                    >
                        <div className="field my-0">
                            <textarea
                                aria-label="Story so far text"
                                rows={8}
                                value={draft}
                                disabled={saving}
                                onChange={(event) => setDraft(event.target.value)}
                            />
                        </div>
                        <p className="m-0 text-sm text-muted">Your version wins: later updates keep what you write here.</p>
                        <div className="flex gap-2">
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
                        <p className="mt-0 mb-2 whitespace-pre-wrap">{data.text}</p>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-sm text-muted">
                                Covers the first {data.coveredMessages} {data.coveredMessages === 1 ? 'Message' : 'Messages'} · Written by{' '}
                                {data.writtenBy === 'user' ? 'you' : 'the AI'}
                            </span>
                            <button
                                type="button"
                                className="button button-quiet button-small"
                                aria-label="Edit the Story so far"
                                onClick={() => setDraft(data.text ?? '')}
                            >
                                Edit
                            </button>
                        </div>
                    </>
                )}
                {data?.failedReason && (
                    <p className="mt-2 mb-0 text-sm text-muted">Couldn’t update it just now. It tries again after the next turn.</p>
                )}
            </div>
        </section>
    );
}

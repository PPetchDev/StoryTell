'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { Loading } from '@/components/query-state';
import { Sheet } from '@/components/sheet/sheet';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { LoreSuggestion, loreSuggestionsApi } from '@/lib/lore-suggestions';
import { storyApi } from '@/lib/story';

interface LoreSuggestionsSheetProps {
    storyId: number;
    chatId: number;
    onClose(): void;
}

type AddState = 'idle' | 'adding' | 'added';

/**
 * Lore from this Chat (.scratch/lore-from-chat/spec.md): asks once, as it opens, for new Lore entries
 * drawn from what the Chat has established about the world, and lists them. Each is added to the
 * Story's own Lore only by its own tap; the rest are left.
 */
export function LoreSuggestionsSheet({ storyId, chatId, onClose }: LoreSuggestionsSheetProps) {
    const { reportUnreachable } = useConnection();
    const [suggestions, setSuggestions] = useState<LoreSuggestion[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [added, setAdded] = useState<Record<number, AddState>>({});
    const [addError, setAddError] = useState<string | null>(null);

    const fail = useCallback(
        (caught: unknown, fallback: string, set: (message: string) => void) => {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            set(caught instanceof ApiError ? caught.message : fallback);
        },
        [reportUnreachable],
    );

    const ask = useCallback(async () => {
        setError(null);
        setSuggestions(null);
        setAdded({});
        try {
            setSuggestions((await loreSuggestionsApi.suggest(storyId, chatId)).suggestions);
        } catch (caught) {
            fail(caught, 'Could not read the Chat for Lore.', setError);
        }
    }, [storyId, chatId, fail]);

    // Once per opening: each ask is a paid call, and React runs a new effect twice in development.
    const asked = useRef(false);
    useEffect(() => {
        if (asked.current) return;
        asked.current = true;
        void ask();
    }, [ask]);

    const add = async (at: number, suggestion: LoreSuggestion) => {
        setAddError(null);
        setAdded((now) => ({ ...now, [at]: 'adding' }));
        try {
            await storyApi.addLoreEntry(storyId, { name: suggestion.name, keywords: suggestion.keywords, text: suggestion.text });
            setAdded((now) => ({ ...now, [at]: 'added' }));
        } catch (caught) {
            setAdded((now) => ({ ...now, [at]: 'idle' }));
            fail(caught, `Could not add ${suggestion.name} to the Lore.`, setAddError);
        }
    };

    return (
        <Sheet label="Lore from this Chat" title="Lore from this Chat" onClose={onClose}>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-1">
                <p className="m-0 text-sm text-muted">New details of the world this Chat has made up. Add the ones to keep: every Chat of the Story will know them.</p>
                {error ? (
                    <div className="grid gap-2">
                        <p role="alert" className="turn-error m-0">
                            {error}
                        </p>
                        <button type="button" className="button button-small justify-self-start" onClick={() => void ask()}>
                            Retry
                        </button>
                    </div>
                ) : suggestions === null ? (
                    <Loading lines={3} label="Reading the Chat…" />
                ) : suggestions.length === 0 ? (
                    <p className="m-0">Nothing new for the Lore in this Chat yet.</p>
                ) : (
                    <ul className="m-0 grid list-none gap-3 p-0" aria-label="Suggested Lore">
                        {suggestions.map((suggestion, at) => {
                            const state = added[at] ?? 'idle';
                            return (
                                <li key={`${at}-${suggestion.name}`} className="grid gap-1.5 rounded-lg bg-bg px-3 py-2.5">
                                    <h3 className="m-0 text-sm font-semibold [overflow-wrap:anywhere]">{suggestion.name}</h3>
                                    {suggestion.keywords.length > 0 && (
                                        <p className="m-0 text-sm text-muted [overflow-wrap:anywhere]">Also: {suggestion.keywords.join(', ')}</p>
                                    )}
                                    <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{suggestion.text}</p>
                                    <button
                                        type="button"
                                        className="button justify-self-start"
                                        aria-label={state === 'added' ? `${suggestion.name} added` : `Add ${suggestion.name} to Lore`}
                                        disabled={state !== 'idle'}
                                        onClick={() => void add(at, suggestion)}
                                    >
                                        {state === 'added' ? 'Added' : state === 'adding' ? 'Adding…' : 'Add to Lore'}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {addError && (
                    <p role="alert" className="turn-error m-0">
                        {addError}
                    </p>
                )}
                <Link href={`/stories/${storyId}?tab=lore`} className="button button-quiet justify-self-start">
                    Open the Story&apos;s Lore
                </Link>
            </div>
        </Sheet>
    );
}

'use client';

import { useRouter } from 'next/navigation';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

import { useApiQuery, useConnection } from '@/components/connection';
import { CardImport } from '@/components/home/card-import';
import { ContinueRow } from '@/components/home/continue-row';
import { StoryGrid } from '@/components/home/story-grid';
import { StorySheet } from '@/components/home/story-sheet';
import { ApiUnreachableError } from '@/lib/api';
import { CARD_FILE_TYPES, FROM_CARD_PARAM } from '@/lib/character-card';
import { newestPlayed } from '@/lib/home';
import { storyApi, StorySummary } from '@/lib/story';

type NewStoryState =
    | { kind: 'closed' }
    | { kind: 'open' }
    | { kind: 'drafting' }
    | { kind: 'blank' }
    /** A Character card is picked: the panel shows the import form instead of the idea. */
    | { kind: 'card'; file: File }
    | { kind: 'error'; message: string };

export default function HomePage() {
    const router = useRouter();
    const { reportUnreachable } = useConnection();
    const stories = useApiQuery<{ stories: StorySummary[] }>('/stories');
    const [newStory, setNewStory] = useState<NewStoryState>({ kind: 'closed' });
    const [idea, setIdea] = useState('');
    const [openStory, setOpenStory] = useState<StorySummary | null>(null);
    const cardInput = useRef<HTMLInputElement>(null);
    const closeSheet = useCallback(() => setOpenStory(null), []);
    const continuable = stories.status === 'ready' ? newestPlayed(stories.data.stories) : null;

    const open = async (create: () => Promise<{ id: number }>, busy: NewStoryState) => {
        setNewStory(busy);
        try {
            const story = await create();
            router.push(`/stories/${story.id}`);
        } catch (error) {
            if (error instanceof ApiUnreachableError) reportUnreachable();
            else setNewStory({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' });
        }
    };
    /** Draft from idea (spec: "Story drafting"): one call, the Story opens once it is saved. */
    const draft = () => void open(() => storyApi.draft(idea), { kind: 'drafting' });
    /** The blank path from ticket 21, kept beside drafting. */
    const startBlank = () => void open(() => storyApi.create(), { kind: 'blank' });

    /** From a Character card (spec: "Character cards"): the phone's file picker, then the import form. */
    const chooseCard = () => {
        if (cardInput.current) cardInput.current.value = '';
        cardInput.current?.click();
    };
    const cardPicked = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) setNewStory({ kind: 'card', file });
    };

    const busy = newStory.kind === 'drafting' || newStory.kind === 'blank';
    const panelOpen = newStory.kind !== 'closed';

    return (
        <main className="wide">
            <div className="page-header">
                <h1>Stories</h1>
                {!panelOpen && (
                    <button type="button" className="button" onClick={() => setNewStory({ kind: 'open' })}>
                        New Story
                    </button>
                )}
            </div>

            {panelOpen && (
                <section className="card new-story" aria-label="New Story">
                    <h2>New Story</h2>
                    <input
                        ref={cardInput}
                        className="visually-hidden"
                        type="file"
                        accept={CARD_FILE_TYPES}
                        aria-label="Character card file"
                        tabIndex={-1}
                        onChange={cardPicked}
                    />
                    {newStory.kind === 'card' ? (
                        <CardImport
                            key={`${newStory.file.name}-${newStory.file.size}-${newStory.file.lastModified}`}
                            file={newStory.file}
                            onImported={(story) => router.push(`/stories/${story.id}?${FROM_CARD_PARAM}=1`)}
                            onChooseAnother={chooseCard}
                            onCancel={() => setNewStory({ kind: 'closed' })}
                        />
                    ) : (
                        <>
                        <div className="field">
                            <label htmlFor="new-story-idea">Idea</label>
                            <textarea
                                id="new-story-idea"
                                rows={5}
                                value={idea}
                                disabled={busy}
                                placeholder="A line or a page: who, where, what is about to happen…"
                                aria-describedby="new-story-idea-hint"
                                onChange={(event) => setIdea(event.target.value)}
                            />
                            <p id="new-story-idea-hint" className="hint">
                                One AI call drafts the whole Story from it: Setting, Opening, Style, your Role and the Characters.
                                You can change every field afterwards.
                            </p>
                        </div>
                        {newStory.kind === 'error' && (
                            <p role="alert" className="field-error">
                                <span>Couldn&apos;t draft the Story: {newStory.message}</span>{' '}
                                <button type="button" className="button button-quiet button-small" onClick={draft}>
                                    Retry
                                </button>
                            </p>
                        )}
                        {newStory.kind === 'drafting' && (
                            <p className="muted" role="status">
                                Drafting… this takes a little while.
                            </p>
                        )}
                        <div className="actions">
                            <button type="button" className="button" onClick={draft} disabled={busy || idea.trim() === ''}>
                                {newStory.kind === 'drafting' ? 'Drafting…' : 'Draft from idea'}
                            </button>
                            <button type="button" className="button button-quiet" onClick={startBlank} disabled={busy}>
                                {newStory.kind === 'blank' ? 'Creating…' : 'Start blank'}
                            </button>
                            <button type="button" className="button button-quiet" onClick={chooseCard} disabled={busy}>
                                From a Character card
                            </button>
                            <button
                                type="button"
                                className="button button-quiet"
                                onClick={() => setNewStory({ kind: 'closed' })}
                                disabled={busy}
                            >
                                Cancel
                            </button>
                        </div>
                        </>
                    )}
                </section>
            )}

            {stories.status === 'loading' && <p className="muted">Loading…</p>}
            {stories.status === 'error' && <p role="alert">{stories.error.message}</p>}
            {stories.status === 'ready' &&
                (stories.data.stories.length === 0 ? (
                    <p className="muted">No Stories yet.</p>
                ) : (
                    <>
                        {continuable && <ContinueRow story={continuable} />}
                        <StoryGrid stories={stories.data.stories} onOpen={(story) => setOpenStory(story)} />
                    </>
                ))}
            {openStory && <StorySheet story={openStory} onClose={closeSheet} />}
        </main>
    );
}

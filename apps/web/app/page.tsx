'use client';

import { useRouter } from 'next/navigation';
import { ChangeEvent, useCallback, useEffect, useRef, useState } from 'react';

import { announce } from '@/components/announcer';
import { useApiQuery, useConnection } from '@/components/connection';
import { CardImport } from '@/components/home/card-import';
import { ContinueRow } from '@/components/home/continue-row';
import { StoryGrid } from '@/components/home/story-grid';
import { StorySheet } from '@/components/home/story-sheet';
import { ErrorState, Loading } from '@/components/query-state';
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
    const ideaInput = useRef<HTMLTextAreaElement>(null);
    const newStoryButton = useRef<HTMLButtonElement>(null);
    /** Bumped by Cancel, so a write still on its way when the panel closed doesn't open its Story. */
    const attempt = useRef(0);
    const closeSheet = useCallback(() => setOpenStory(null), []);
    const continuable = stories.status === 'ready' ? newestPlayed(stories.data.stories) : null;

    const open = async (create: () => Promise<{ id: number }>, busy: NewStoryState) => {
        const mine = ++attempt.current;
        setNewStory(busy);
        try {
            const story = await create();
            // Cancelled while it was on its way: the Story is made all the same, so show it in the list.
            if (mine !== attempt.current) stories.retry();
            else router.push(`/stories/${story.id}`);
        } catch (error) {
            if (mine !== attempt.current) return;
            if (error instanceof ApiUnreachableError) reportUnreachable();
            else setNewStory({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong.' });
        }
    };
    /** Draft from idea (spec: "Story drafting"): one call, the Story opens once it is saved. */
    const draft = () => void open(() => storyApi.draft(idea), { kind: 'drafting' });
    /** The blank path from ticket 21, kept beside drafting. */
    const startBlank = () => void open(() => storyApi.create(), { kind: 'blank' });

    /** Cancel works at every step (audit M37): a draft still being written is left to finish on its own. */
    const close = () => {
        if (newStory.kind === 'drafting' || newStory.kind === 'blank') {
            announce('Stopped waiting. If the Story is made after all, it shows up in your Stories.');
        }
        attempt.current++;
        setNewStory({ kind: 'closed' });
    };

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

    // Focus goes to the Idea as the panel opens, and back to New Story as it closes (audit M35).
    const wasOpen = useRef(panelOpen);
    useEffect(() => {
        if (panelOpen === wasOpen.current) return;
        wasOpen.current = panelOpen;
        if (panelOpen) ideaInput.current?.focus();
        else newStoryButton.current?.focus();
    }, [panelOpen]);

    return (
        <main className="wide">
            <div className="page-header">
                <h1>Stories</h1>
                {/* Quiet beside the Continue row's Play, so one purple button asks to be tapped; the main one with nothing to continue (audit Low, Home). */}
                {!panelOpen && (
                    <button
                        ref={newStoryButton}
                        type="button"
                        className={continuable ? 'button button-quiet' : 'button'}
                        onClick={() => setNewStory({ kind: 'open' })}
                    >
                        New Story
                    </button>
                )}
            </div>

            {panelOpen && (
                <section className="card mb-5" aria-label="New Story">
                    <h2>New Story</h2>
                    <input
                        ref={cardInput}
                        className="sr-only"
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
                            onCancel={close}
                            onMadeAfterCancel={stories.retry}
                        />
                    ) : (
                        <>
                            <div className="field">
                                <label htmlFor="new-story-idea">Idea</label>
                                <textarea
                                    ref={ideaInput}
                                    id="new-story-idea"
                                    rows={5}
                                    value={idea}
                                    readOnly={busy}
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
                            <div className="actions mt-3 flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="button"
                                    onClick={draft}
                                    disabled={busy || idea.trim() === ''}
                                    aria-busy={newStory.kind === 'drafting' || undefined}
                                >
                                    {newStory.kind === 'drafting' ? 'Drafting…' : 'Draft from idea'}
                                </button>
                                <button
                                    type="button"
                                    className="button button-quiet"
                                    onClick={startBlank}
                                    disabled={busy}
                                    aria-busy={newStory.kind === 'blank' || undefined}
                                >
                                    {newStory.kind === 'blank' ? 'Creating…' : 'Start blank'}
                                </button>
                                <button type="button" className="button button-quiet" onClick={chooseCard} disabled={busy}>
                                    From a Character card
                                </button>
                                <button
                                    type="button"
                                    className="button button-quiet"
                                    aria-describedby={newStory.kind === 'drafting' ? 'cancel-draft-note' : undefined}
                                    onClick={close}
                                >
                                    Cancel
                                </button>
                            </div>
                            {/* The draft is already paid for, so Cancel closes this panel and lets it finish (audit M37). */}
                            {newStory.kind === 'drafting' && (
                                <p id="cancel-draft-note" className="hint mb-0">
                                    Cancel closes this. A draft already under way still finishes and appears in your Stories.
                                </p>
                            )}
                        </>
                    )}
                </section>
            )}

            {stories.status === 'loading' && <Loading label="Loading Stories…" />}
            {stories.status === 'error' && <ErrorState title="Couldn't load your Stories." error={stories.error} onRetry={stories.retry} />}
            {stories.status === 'ready' &&
                (stories.data.stories.length === 0 ? (
                    <p className="muted">
                        No Stories yet. Tap <strong className="text-text">New Story</strong> to draft one from an idea, start blank,
                        or bring in a Character card.
                    </p>
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

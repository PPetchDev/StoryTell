'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useApiQuery, useConnection } from '@/components/connection';
import { ApiUnreachableError } from '@/lib/api';
import { storyApi, StorySummary, storyTitle } from '@/lib/story';

type NewStoryState =
    | { kind: 'closed' }
    | { kind: 'open' }
    | { kind: 'drafting' }
    | { kind: 'blank' }
    | { kind: 'error'; message: string };

export default function HomePage() {
    const router = useRouter();
    const { reportUnreachable } = useConnection();
    const stories = useApiQuery<{ stories: StorySummary[] }>('/stories');
    const [newStory, setNewStory] = useState<NewStoryState>({ kind: 'closed' });
    const [idea, setIdea] = useState('');

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

    const busy = newStory.kind === 'drafting' || newStory.kind === 'blank';
    const panelOpen = newStory.kind !== 'closed';

    return (
        <main>
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
                        <button
                            type="button"
                            className="button button-quiet"
                            onClick={() => setNewStory({ kind: 'closed' })}
                            disabled={busy}
                        >
                            Cancel
                        </button>
                    </div>
                </section>
            )}

            {stories.status === 'loading' && <p className="muted">Loading…</p>}
            {stories.status === 'error' && <p role="alert">{stories.error.message}</p>}
            {stories.status === 'ready' &&
                (stories.data.stories.length === 0 ? (
                    <p className="muted">No Stories yet.</p>
                ) : (
                    <ul className="story-list" aria-label="Stories">
                        {stories.data.stories.map((story) => (
                            <li key={story.id}>
                                <Link href={`/stories/${story.id}`} className="story-link">
                                    <span className="story-title">{storyTitle(story)}</span>
                                    <span className={story.playable ? 'pill pill-ok' : 'pill'}>
                                        {story.playable ? 'Playable' : 'Not playable yet'}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                ))}
        </main>
    );
}

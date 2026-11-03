'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useApiQuery, useConnection } from '@/components/connection';
import { ApiUnreachableError } from '@/lib/api';
import { storyApi, StorySummary, storyTitle } from '@/lib/story';

export default function HomePage() {
    const router = useRouter();
    const { reportUnreachable } = useConnection();
    const stories = useApiQuery<{ stories: StorySummary[] }>('/stories');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    const createStory = async () => {
        setCreating(true);
        setCreateError(null);
        try {
            const story = await storyApi.create();
            router.push(`/stories/${story.id}`);
        } catch (error) {
            if (error instanceof ApiUnreachableError) reportUnreachable();
            else setCreateError(error instanceof Error ? error.message : 'Could not create the Story.');
            setCreating(false);
        }
    };

    return (
        <main>
            <div className="page-header">
                <h1>Stories</h1>
                <button type="button" className="button" onClick={createStory} disabled={creating}>
                    {creating ? 'Creating…' : 'New Story'}
                </button>
            </div>
            {createError && <p role="alert">{createError}</p>}
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

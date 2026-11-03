'use client';

import { useApiQuery } from '@/components/connection';

interface StorySummary {
    id: number;
    title: string;
    createdAt: string;
    updatedAt: string;
}

export default function HomePage() {
    const stories = useApiQuery<{ stories: StorySummary[] }>('/stories');

    return (
        <main>
            <h1>Stories</h1>
            {stories.status === 'loading' && <p className="muted">Loading…</p>}
            {stories.status === 'error' && <p role="alert">{stories.error.message}</p>}
            {stories.status === 'ready' &&
                (stories.data.stories.length === 0 ? (
                    <p className="muted">No Stories yet.</p>
                ) : (
                    <ul className="story-list" aria-label="Stories">
                        {stories.data.stories.map((story) => (
                            <li key={story.id}>{story.title}</li>
                        ))}
                    </ul>
                ))}
        </main>
    );
}

'use client';

import Link from 'next/link';
import { use } from 'react';

import { useApiQuery } from '@/components/connection';
import { StoryEditor } from '@/components/story-editor/story-editor';
import { Story } from '@/lib/story';

export default function StoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const story = useApiQuery<Story>(`/stories/${id}`);

    if (story.status === 'loading') {
        return (
            <main>
                <p className="muted">Loading…</p>
            </main>
        );
    }
    if (story.status === 'error') {
        return (
            <main>
                <p role="alert">{story.error.message}</p>
                <Link href="/">Back to Stories</Link>
            </main>
        );
    }
    return <StoryEditor initial={story.data} />;
}

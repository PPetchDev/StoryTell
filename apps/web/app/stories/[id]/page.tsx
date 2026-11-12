'use client';

import Link from 'next/link';
import { use } from 'react';

import { useApiQuery } from '@/components/connection';
import { ErrorState, Loading } from '@/components/query-state';
import { StoryEditor } from '@/components/story-editor/story-editor';
import { Story } from '@/lib/story';

export default function StoryPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const story = useApiQuery<Story>(`/stories/${id}`);

    // While it loads, a skeleton in a status region; if it fails, why, with Try again (audit M9).
    if (story.status === 'loading') {
        return (
            <main className="wide">
                <Loading label="Loading the Story…" lines={4} />
            </main>
        );
    }
    if (story.status === 'error') {
        return (
            <main className="wide">
                <ErrorState error={story.error} title="Couldn't load this Story." onRetry={story.retry} />
                <Link href="/">Back to Stories</Link>
            </main>
        );
    }
    return <StoryEditor initial={story.data} />;
}

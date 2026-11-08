'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, use } from 'react';

import { useApiQuery } from '@/components/connection';
import { Gallery } from '@/components/snapshot/gallery';
import { Story, storyTitle } from '@/lib/story';

/** A Story's Gallery (spec: stories 119–123), grouped by Chat. `?chat=` opens it on that Chat. */
function GalleryPage({ storyId }: { storyId: number }) {
    const chatParam = useSearchParams().get('chat');
    const story = useApiQuery<Story>(`/stories/${storyId}`);

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
    return (
        <main className="wide">
            <nav className="breadcrumbs">
                <Link href={`/stories/${storyId}/chats`}>← Chats</Link>
            </nav>
            <h1>Gallery · {storyTitle(story.data)}</h1>
            <Gallery
                stories={[{ id: storyId, title: story.data.title }]}
                initialChatId={chatParam ? Number(chatParam) : null}
            />
        </main>
    );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return (
        <Suspense>
            <GalleryPage storyId={Number(id)} />
        </Suspense>
    );
}

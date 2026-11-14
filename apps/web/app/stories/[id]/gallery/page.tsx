'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, use } from 'react';

import { useApiQuery } from '@/components/connection';
import { ArrowLeftIcon } from '@/components/icons';
import { ErrorState, Loading } from '@/components/query-state';
import { Gallery } from '@/components/snapshot/gallery';
import { Story, storyTitle } from '@/lib/story';

/** The way back to the Story's Chats, the same while loading and after (audit L9). */
function Breadcrumbs({ storyId }: { storyId: number }) {
    return (
        <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link href={`/stories/${storyId}/chats`}>
                <ArrowLeftIcon size={18} /> Chats
            </Link>
        </nav>
    );
}

/** A Story's Gallery (spec: stories 119–123), grouped by Chat. `?chat=` opens it on that Chat. */
function GalleryPage({ storyId }: { storyId: number }) {
    const chatParam = useSearchParams().get('chat');
    const story = useApiQuery<Story>(`/stories/${storyId}`);

    if (story.status === 'loading') return <GalleryLoading storyId={storyId} />;
    if (story.status === 'error') {
        return (
            <main className="wide">
                <Breadcrumbs storyId={storyId} />
                <h1>Gallery</h1>
                <ErrorState title="Couldn't load this Story." error={story.error} onRetry={story.retry} />
                <Link href="/">Back to Stories</Link>
            </main>
        );
    }
    return (
        <main className="wide">
            <Breadcrumbs storyId={storyId} />
            {/* "Gallery" as the main Gallery has it, the Story under it: a long title no longer breaks the heading (audit Low, Story Gallery). */}
            <h1 className="mb-0">Gallery</h1>
            <p className="mt-1 mb-5 text-muted [overflow-wrap:anywhere]">{storyTitle(story.data)}</p>
            <Gallery
                stories={[{ id: storyId, title: story.data.title }]}
                initialChatId={chatParam ? Number(chatParam) : null}
            />
        </main>
    );
}

/** The page's own width from the first paint, so nothing jumps when the Story arrives (audit L27). */
function GalleryLoading({ storyId }: { storyId: number }) {
    return (
        <main className="wide">
            <Breadcrumbs storyId={storyId} />
            <h1>Gallery</h1>
            <Loading label="Loading the Gallery…" />
        </main>
    );
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    return (
        <Suspense fallback={<GalleryLoading storyId={Number(id)} />}>
            <GalleryPage storyId={Number(id)} />
        </Suspense>
    );
}

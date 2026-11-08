'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, use } from 'react';

import { useApiQuery } from '@/components/connection';
import { Gallery } from '@/components/snapshot/gallery';
import { ApiError } from '@/lib/api';
import { ChatSummary } from '@/lib/chat';
import { Story, storyTitle } from '@/lib/story';

/** A Story's Gallery (spec: stories 119–123). `?chat=` opens it filtered to one Chat. */
function GalleryPage({ storyId }: { storyId: number }) {
    const chatParam = useSearchParams().get('chat');
    const story = useApiQuery<Story>(`/stories/${storyId}`);
    const chats = useApiQuery<{ chats: ChatSummary[] }>(`/stories/${storyId}/chats`);

    if (story.status === 'loading' || chats.status === 'loading') {
        return (
            <main>
                <p className="muted">Loading…</p>
            </main>
        );
    }
    if (story.status === 'error' || chats.status === 'error') {
        const failed = story.status === 'error' ? story.error : (chats as { error: ApiError }).error;
        return (
            <main>
                <p role="alert">{failed.message}</p>
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
            <Gallery storyId={storyId} chats={chats.data.chats} initialChatId={chatParam ? Number(chatParam) : null} />
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

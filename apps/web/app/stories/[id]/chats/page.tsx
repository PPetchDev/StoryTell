'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';

import { ChatList } from '@/components/chat/chat-list';
import { useApiQuery, useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { chatApi, ChatListItem } from '@/lib/chat';
import { Story, storyTitle } from '@/lib/story';

/** A Story's Chats (spec: user stories 49–51, 78). */
export default function ChatsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const storyId = Number(id);
    const router = useRouter();
    const { reportUnreachable } = useConnection();
    const story = useApiQuery<Story>(`/stories/${id}`);
    const chats = useApiQuery<{ chats: ChatListItem[] }>(`/stories/${id}/chats`);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startChat = async () => {
        setStarting(true);
        setError(null);
        try {
            const chat = await chatApi.create(storyId);
            router.push(`/stories/${storyId}/chats/${chat.id}`);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : 'Could not start a Chat.');
            setStarting(false);
        }
    };

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
        <main>
            <nav className="breadcrumbs">
                <Link href="/">← Stories</Link>
                <Link href={`/stories/${storyId}/gallery`}>Gallery</Link>
                <Link href={`/stories/${storyId}`}>Edit Story</Link>
            </nav>
            <div className="page-header">
                <h1>{storyTitle(story.data)}</h1>
                <button type="button" className="button" onClick={startChat} disabled={starting || !story.data.playable}>
                    {starting ? 'Starting…' : 'New Chat'}
                </button>
            </div>
            {!story.data.playable && (
                <p className="notice" role="status">
                    Not playable yet. Still to fill in: {story.data.missing.map((field) => field.label).join(', ')}.
                </p>
            )}
            {error && <p role="alert">{error}</p>}
            <ChatList storyId={storyId} initial={chats.data.chats} />
        </main>
    );
}

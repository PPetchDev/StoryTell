'use client';

import Link from 'next/link';
import { use } from 'react';

import { ChatScreen } from '@/components/chat/chat-screen';
import { useApiQuery } from '@/components/connection';
import { Chat } from '@/lib/chat';
import { Story } from '@/lib/story';

export default function ChatPage({ params }: { params: Promise<{ id: string; chatId: string }> }) {
    const { id, chatId } = use(params);
    const chat = useApiQuery<Chat>(`/stories/${id}/chats/${chatId}`);
    // The cast's order picks each Character's colour; it loads alongside, so colours never flicker.
    const story = useApiQuery<Story>(`/stories/${id}`);

    if (chat.status === 'loading' || story.status === 'loading') {
        return (
            <main>
                <p className="muted">Loading…</p>
            </main>
        );
    }
    if (chat.status === 'error') {
        return (
            <main>
                <p role="alert">{chat.error.message}</p>
                <Link href={`/stories/${id}/chats`}>Back to Chats</Link>
            </main>
        );
    }
    // Without the Story every speaker gets the neutral colour; the Chat still reads.
    const cast = story.status === 'ready' ? story.data.characters.map((character) => character.id) : [];
    // The Scenes give the Scene strip each Scene's goal; without them it shows the name alone.
    const scenes = story.status === 'ready' ? story.data.scenes : [];
    return <ChatScreen initial={chat.data} cast={cast} scenes={scenes} />;
}

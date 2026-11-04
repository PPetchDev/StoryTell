'use client';

import Link from 'next/link';
import { use } from 'react';

import { ChatScreen } from '@/components/chat/chat-screen';
import { useApiQuery } from '@/components/connection';
import { Chat } from '@/lib/chat';

export default function ChatPage({ params }: { params: Promise<{ id: string; chatId: string }> }) {
    const { id, chatId } = use(params);
    const chat = useApiQuery<Chat>(`/stories/${id}/chats/${chatId}`);

    if (chat.status === 'loading') {
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
    return <ChatScreen initial={chat.data} />;
}

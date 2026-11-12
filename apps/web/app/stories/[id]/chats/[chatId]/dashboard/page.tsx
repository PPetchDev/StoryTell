'use client';

import Link from 'next/link';
import { use } from 'react';

import { Dashboard } from '@/components/chat/dashboard';
import { useApiQuery } from '@/components/connection';
import { ErrorState, Loading } from '@/components/query-state';
import { portraitsOf } from '@/lib/character-colour';
import { ChatDashboard } from '@/lib/chat';
import { Story } from '@/lib/story';

export default function DashboardPage({ params }: { params: Promise<{ id: string; chatId: string }> }) {
    const { id, chatId } = use(params);
    const dashboard = useApiQuery<ChatDashboard>(`/stories/${id}/chats/${chatId}/dashboard`);
    // The Story gives each Character their colour and picture; without it they show the neutral colour.
    const story = useApiQuery<Story>(`/stories/${id}`);

    if (dashboard.status === 'loading' || story.status === 'loading') {
        return (
            <main className="wide">
                <Loading label="Loading the Dashboard…" lines={5} />
            </main>
        );
    }
    if (dashboard.status === 'error') {
        return (
            <main className="wide">
                <ErrorState error={dashboard.error} title="Couldn't load the Dashboard." onRetry={dashboard.retry} />
                <Link href={`/stories/${id}/chats/${chatId}`}>Back to the Chat</Link>
            </main>
        );
    }
    const cast = story.status === 'ready' ? story.data.characters.map((character) => character.id) : [];
    const portraits = story.status === 'ready' ? portraitsOf(story.data.characters) : {};
    return <Dashboard initial={dashboard.data} cast={cast} portraits={portraits} />;
}

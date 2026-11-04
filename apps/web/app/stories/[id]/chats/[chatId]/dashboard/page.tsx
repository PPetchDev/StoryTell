'use client';

import Link from 'next/link';
import { use } from 'react';

import { Dashboard } from '@/components/chat/dashboard';
import { useApiQuery } from '@/components/connection';
import { ChatDashboard } from '@/lib/chat';

export default function DashboardPage({ params }: { params: Promise<{ id: string; chatId: string }> }) {
    const { id, chatId } = use(params);
    const dashboard = useApiQuery<ChatDashboard>(`/stories/${id}/chats/${chatId}/dashboard`);

    if (dashboard.status === 'loading') {
        return (
            <main>
                <p className="muted">Loading…</p>
            </main>
        );
    }
    if (dashboard.status === 'error') {
        return (
            <main>
                <p role="alert">{dashboard.error.message}</p>
                <Link href={`/stories/${id}/chats/${chatId}`}>Back to the Chat</Link>
            </main>
        );
    }
    return <Dashboard initial={dashboard.data} />;
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useId, useRef, useState } from 'react';

import { ChatList } from '@/components/chat/chat-list';
import { useApiQuery, useConnection } from '@/components/connection';
import { ArrowLeftIcon, PencilIcon } from '@/components/icons';
import { ErrorState, Loading } from '@/components/query-state';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { chatApi, ChatListItem } from '@/lib/chat';
import { Story, storyTitle } from '@/lib/story';

/** Gallery and Edit Story in the header: an outlined pill, 44px tall, the text colour. */
const PLACE_LINK = 'rounded-full border border-line px-3 text-sm font-semibold !text-text focus-ring';

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
    const whyId = useId();
    const heading = useRef<HTMLHeadingElement>(null);

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
                <Loading label="Loading the Chats…" />
            </main>
        );
    }
    if (story.status === 'error' || chats.status === 'error') {
        const failed = story.status === 'error' ? story.error : (chats as { error: ApiError }).error;
        return (
            <main>
                <ErrorState
                    error={failed}
                    title="Couldn't load the Chats."
                    onRetry={() => {
                        if (story.status === 'error') story.retry();
                        if (chats.status === 'error') chats.retry();
                    }}
                />
                <Link href="/">Back to Stories</Link>
            </main>
        );
    }

    const playable = story.data.playable;
    return (
        <main>
            {/*
             * Back on the left; the Story's other places on the right as small outlined links, so
             * "Gallery" no longer sits in the middle like the page's name (docs/ui-audit-2026-11-13.md, M8).
             */}
            <nav className="breadcrumbs" aria-label="Breadcrumb">
                <Link href="/">
                    <ArrowLeftIcon size={18} />
                    Stories
                </Link>
                <span className="flex items-center gap-2">
                    <Link href={`/stories/${storyId}/gallery`} className={PLACE_LINK}>
                        <svg
                            viewBox="0 0 24 24"
                            width="16"
                            height="16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
                            <circle cx="9" cy="10" r="1.6" />
                            <path d="m4 18 5-5 4 4 2.5-2.5L20 18" />
                        </svg>
                        Gallery
                    </Link>
                    <Link href={`/stories/${storyId}`} className={PLACE_LINK}>
                        <PencilIcon size={16} />
                        Edit Story
                    </Link>
                </span>
            </nav>
            <div className="page-header">
                <h1 ref={heading} tabIndex={-1}>
                    {storyTitle(story.data)}
                </h1>
                {/* Not playable: still focusable, and says why (audit L35). */}
                <button
                    type="button"
                    className="button"
                    onClick={() => playable && !starting && void startChat()}
                    disabled={starting}
                    aria-busy={starting || undefined}
                    aria-disabled={!playable || undefined}
                    aria-describedby={!playable ? whyId : undefined}
                >
                    {starting ? 'Starting…' : 'New Chat'}
                </button>
            </div>
            {!playable && (
                <p id={whyId} className="notice" role="status">
                    Not playable yet. Still to fill in: {story.data.missing.map((field) => field.label).join(', ')}.
                </p>
            )}
            {error && (
                <p role="alert" className="turn-error">
                    {error}
                </p>
            )}
            <ChatList storyId={storyId} initial={chats.data.chats} emptyFocus={() => heading.current} />
        </main>
    );
}

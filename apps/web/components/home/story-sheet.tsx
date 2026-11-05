'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useConnection } from '@/components/connection';
import { Sheet } from '@/components/sheet/sheet';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { chatApi } from '@/lib/chat';
import { coverBackground, stillToFillIn } from '@/lib/home';
import { StorySummary, storyTitle } from '@/lib/story';

import styles from './story-sheet.module.css';

/**
 * What tapping a Story's card offers (spec story 53): Continue its newest Chat, start a new
 * Chat, or edit it. A Draft says how much is missing instead of offering play.
 */
export function StorySheet({ story, onClose }: { story: StorySummary; onClose(): void }) {
    const router = useRouter();
    const { reportUnreachable } = useConnection();
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const title = storyTitle(story);

    const startChat = async () => {
        setStarting(true);
        setError(null);
        try {
            const chat = await chatApi.create(story.id);
            router.push(`/stories/${story.id}/chats/${chat.id}`);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : "Couldn't start a Chat.");
            setStarting(false);
        }
    };

    return (
        <Sheet label={title} onClose={onClose}>
            <div className={styles.body}>
                <span className={styles.cover} style={{ background: coverBackground(story) }} aria-hidden="true" />
                <h2 className={styles.title}>{title}</h2>
                {story.hook && <p className={styles.hook}>{story.hook}</p>}
                {story.playable ? (
                    <>
                        {story.latestChat && (
                            <Link href={`/stories/${story.id}/chats/${story.latestChat.id}`} className={styles.primary}>
                                <span aria-hidden="true">▶</span> Continue
                                {story.latestChat.sceneName ? ` · ${story.latestChat.sceneName}` : ''}
                            </Link>
                        )}
                        <button
                            type="button"
                            className={story.latestChat ? styles.secondary : styles.primary}
                            onClick={() => void startChat()}
                            disabled={starting}
                        >
                            {starting ? 'Starting…' : 'New Chat'}
                        </button>
                        {error && (
                            <p role="alert" className={styles.error}>
                                {error}
                            </p>
                        )}
                    </>
                ) : (
                    <p className={styles.missing}>{stillToFillIn(story.missing.length)}</p>
                )}
                {story.latestChat && (
                    <Link href={`/stories/${story.id}/chats`} className={styles.quiet}>
                        All Chats
                    </Link>
                )}
                <Link href={`/stories/${story.id}`} className={styles.quiet}>
                    Edit Story
                </Link>
            </div>
        </Sheet>
    );
}

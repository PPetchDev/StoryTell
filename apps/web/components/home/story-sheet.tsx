'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useConnection } from '@/components/connection';
import { Sheet } from '@/components/sheet/sheet';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { chatApi } from '@/lib/chat';
import { coverBackground, stillToFillIn } from '@/lib/home';
import { storyApi, StorySummary, storyTitle } from '@/lib/story';

import styles from './story-sheet.module.css';

/**
 * What tapping a Story's card offers (spec story 53): Continue its newest Chat, start a new
 * Chat, edit it, or Duplicate it into a copy that opens in the editor. A Draft says how much
 * is missing instead of offering play.
 */
export function StorySheet({ story, onClose }: { story: StorySummary; onClose(): void }) {
    const router = useRouter();
    const { reportUnreachable } = useConnection();
    const [busy, setBusy] = useState<'starting' | 'duplicating' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const title = storyTitle(story);

    /** Runs one of the sheet's writes, then goes where it leads; a failure shows here and frees the buttons. */
    const run = async (kind: 'starting' | 'duplicating', write: () => Promise<string>, failed: string) => {
        setBusy(kind);
        setError(null);
        try {
            router.push(await write());
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : failed);
            setBusy(null);
        }
    };
    const startChat = () =>
        run('starting', async () => `/stories/${story.id}/chats/${(await chatApi.create(story.id)).id}`, "Couldn't start a Chat.");
    const duplicate = () =>
        run('duplicating', async () => `/stories/${(await storyApi.duplicate(story.id)).id}`, "Couldn't duplicate the Story.");

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
                            disabled={busy !== null}
                        >
                            {busy === 'starting' ? 'Starting…' : 'New Chat'}
                        </button>
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
                <button type="button" className={styles.quiet} onClick={() => void duplicate()} disabled={busy !== null}>
                    {busy === 'duplicating' ? 'Duplicating…' : 'Duplicate'}
                </button>
                {error && (
                    <p role="alert" className={styles.error}>
                        {error}
                    </p>
                )}
            </div>
        </Sheet>
    );
}

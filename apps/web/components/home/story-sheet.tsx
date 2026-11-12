'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { CoverPicture } from '@/components/home/cover-picture';
import { useConnection } from '@/components/connection';
import { PlayIcon } from '@/components/icons';
import { Sheet } from '@/components/sheet/sheet';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { chatApi } from '@/lib/chat';
import { stillToFillIn } from '@/lib/home';
import { storyTitle, storyApi, StorySummary } from '@/lib/story';

/** The sheet's buttons: one full-width column, each 44px or taller. */
const PRIMARY = 'button w-full';
/** The second choice beside the primary one: an accent outline. */
const SECONDARY = 'button w-full border border-accent bg-transparent text-text disabled:border-line disabled:text-muted';
/** The rest: text only, muted until pressed. */
const QUIET = 'button w-full bg-transparent font-semibold text-muted hover:text-text active:bg-quiet-fill';

/**
 * What tapping a Story's card offers (spec story 53): Continue its newest Chat, start a new
 * Chat, edit it, or Duplicate it into a copy that opens in the editor. A Draft says how much
 * is missing instead of offering play, and Edit Story is its main button (audit M42).
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
            <div className="flex flex-col gap-2">
                <CoverPicture story={story} large className="h-40 rounded-lg" />
                <h2 className="mt-1 mb-0 text-xl [overflow-wrap:anywhere]">{title}</h2>
                {story.hook && <p className="mt-0 mb-1 text-md text-muted">{story.hook}</p>}
                {story.playable ? (
                    <>
                        {story.latestChat && (
                            <Link href={`/stories/${story.id}/chats/${story.latestChat.id}`} className={PRIMARY}>
                                <PlayIcon size={18} /> Continue
                                {story.latestChat.sceneName ? ` · ${story.latestChat.sceneName}` : ''}
                            </Link>
                        )}
                        <button
                            type="button"
                            className={story.latestChat ? SECONDARY : PRIMARY}
                            onClick={() => void startChat()}
                            disabled={busy !== null}
                            aria-busy={busy === 'starting' || undefined}
                        >
                            {busy === 'starting' ? 'Starting…' : 'New Chat'}
                        </button>
                    </>
                ) : (
                    <p className="my-1 text-md text-warning">{stillToFillIn(story.missing.length)}</p>
                )}
                {story.latestChat && (
                    <Link href={`/stories/${story.id}/chats`} className={QUIET}>
                        All Chats
                    </Link>
                )}
                <Link href={`/stories/${story.id}`} className={story.playable ? QUIET : PRIMARY}>
                    Edit Story
                </Link>
                <button
                    type="button"
                    className={QUIET}
                    onClick={() => void duplicate()}
                    disabled={busy !== null}
                    aria-busy={busy === 'duplicating' || undefined}
                >
                    {busy === 'duplicating' ? 'Duplicating…' : 'Duplicate'}
                </button>
                {error && (
                    <p role="alert" className="m-0 text-md text-error-text">
                        {error}
                    </p>
                )}
            </div>
        </Sheet>
    );
}

import Link from 'next/link';

import { PlayIcon } from '@/components/icons';
import { ContinuableStory, coverThumbBackground, playedAgo } from '@/lib/home';
import { storyTitle } from '@/lib/story';

const ROW = [
    'mb-5 flex items-center gap-3 p-2',
    'rounded-xl border border-line bg-surface text-text no-underline',
    '[-webkit-tap-highlight-color:transparent] hover:bg-surface-raised active:bg-surface-raised',
].join(' ');

/** "Continue where you left off" (spec story 52): one tap back into the newest-played Chat. */
export function ContinueRow({ story }: { story: ContinuableStory }) {
    const where = story.latestChat.sceneName ?? 'Free play';
    return (
        <Link href={`/stories/${story.id}/chats/${story.latestChat.id}`} className={ROW}>
            <span className="block size-16 flex-none rounded-md" style={{ background: coverThumbBackground(story) }} aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="mb-0.5 text-xs font-bold tracking-wider text-accent uppercase">Continue where you left off</span>
                {/* Two lines before it is cut, never one with an ellipsis (audit L8). */}
                <strong className="line-clamp-2 [overflow-wrap:anywhere]">{storyTitle(story)}</strong>
                <span className="line-clamp-2 text-sm text-muted">
                    {where} · {playedAgo(story.lastPlayedAt)}
                </span>
            </span>
            <span className="mr-1 grid size-11 flex-none place-items-center rounded-full bg-accent-fill text-accent-text" aria-hidden="true">
                <PlayIcon />
            </span>
        </Link>
    );
}

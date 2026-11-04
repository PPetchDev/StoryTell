import Link from 'next/link';

import { ContinuableStory, coverBackground, playedAgo } from '@/lib/home';
import { storyTitle } from '@/lib/story';

import styles from './continue-row.module.css';

/** "Continue where you left off" (spec story 52): one tap back into the newest-played Chat. */
export function ContinueRow({ story }: { story: ContinuableStory }) {
    const where = story.latestChat.sceneName ?? 'Free play';
    return (
        <Link href={`/stories/${story.id}/chats/${story.latestChat.id}`} className={styles.row}>
            <span className={styles.cover} style={{ background: coverBackground(story) }} aria-hidden="true" />
            <span className={styles.text}>
                <span className={styles.kicker}>Continue where you left off</span>
                <strong className={styles.title}>{storyTitle(story)}</strong>
                <span className={styles.meta}>
                    {where} · {playedAgo(story.lastPlayedAt)}
                </span>
            </span>
            <span className={styles.play} aria-hidden="true">
                ▶
            </span>
        </Link>
    );
}

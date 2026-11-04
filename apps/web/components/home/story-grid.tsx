import { coverBackground, playedAgo } from '@/lib/home';
import { StorySummary, storyTitle } from '@/lib/story';

import styles from './story-grid.module.css';

/** Home's Stories as picture cards, two to a row on a phone (spec stories 47–51). */
export function StoryGrid({ stories, onOpen }: { stories: StorySummary[]; onOpen(story: StorySummary): void }) {
    return (
        <ul className={styles.grid} aria-label="Stories">
            {stories.map((story) => (
                <li key={story.id}>
                    <button type="button" className={styles.card} onClick={() => onOpen(story)}>
                        <span className={styles.cover} style={{ background: coverBackground(story) }}>
                            {!story.playable && <span className={styles.badge}>Draft</span>}
                        </span>
                        <strong className={styles.title}>{storyTitle(story)}</strong>
                        {story.hook && <span className={styles.hook}>{story.hook}</span>}
                        <span className={styles.meta}>
                            {story.lastPlayedAt ? `Played ${playedAgo(story.lastPlayedAt)}` : 'Not played yet'}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

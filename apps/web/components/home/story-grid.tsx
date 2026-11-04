import { coverBackground, playedAgo } from '@/lib/home';
import { StorySummary, storyTitle } from '@/lib/story';

import styles from './story-grid.module.css';

/** Home's Stories as picture cards, two to a row on a phone (spec stories 47–51). */
export function StoryGrid({ stories, onOpen }: { stories: StorySummary[]; onOpen(story: StorySummary): void }) {
    return (
        <ul className={styles.grid} aria-label="Stories">
            {stories.map((story) => {
                const id = `story-card-${story.id}`;
                return (
                    <li key={story.id}>
                        {/* Named by its title and badge; the hook and last played are its description. */}
                        <button
                            type="button"
                            className={styles.card}
                            aria-labelledby={`${id}-title ${id}-badge`}
                            aria-describedby={`${id}-hook ${id}-meta`}
                            onClick={() => onOpen(story)}
                        >
                            <span className={styles.cover} style={{ background: coverBackground(story) }}>
                                {!story.playable && (
                                    <span id={`${id}-badge`} className={styles.badge}>
                                        Draft
                                    </span>
                                )}
                            </span>
                            <strong id={`${id}-title`} className={styles.title}>
                                {storyTitle(story)}
                            </strong>
                            {story.hook && (
                                <span id={`${id}-hook`} className={styles.hook}>
                                    {story.hook}
                                </span>
                            )}
                            <span id={`${id}-meta`} className={styles.meta}>
                                {story.lastPlayedAt ? `Played ${playedAgo(story.lastPlayedAt)}` : 'Not played yet'}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

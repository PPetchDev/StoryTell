import { CoverFocus, LatestChat, StorySummary } from './story';

/**
 * Hue pairs that sit well on the dark purple theme; a Story's id picks one, so it never changes.
 * Literal in both themes: a placeholder Cover stands in for a picture, and pictures keep their colours.
 */
const GRADIENTS: Array<[string, string]> = [
    ['#1d2b57', '#5b3b8c'],
    ['#3b1d4f', '#8c3b6e'],
    ['#123c4a', '#3b5b8c'],
    ['#4a2a12', '#8c5b3b'],
    ['#1f3d2c', '#3b7a6e'],
    ['#2c1f4a', '#6e3b8c'],
    ['#4a1d2b', '#8c3b4f'],
    ['#1d3a4f', '#6a5b9c'],
];

/** A stable cover for a Story with no Snapshot, derived from a hash of its id (spec story 49). */
export function coverGradient(storyId: number): string {
    // A multiplicative hash, so neighbouring ids get different gradients.
    const hash = Math.imul(storyId, 2654435761) >>> 0;
    const [from, to] = GRADIENTS[hash % GRADIENTS.length];
    const angle = 140 + (hash >>> 8) % 60;
    return `linear-gradient(${angle}deg, ${from}, ${to})`;
}

/**
 * Where a cropped Cover sits, as a CSS position: the focus point of the picture lands on the
 * same point of the box, so it is always in view whatever the box's shape. Centred without one.
 */
export function coverPosition(focus: CoverFocus | null): string {
    if (!focus) return 'center';
    const percent = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;
    return `${percent(focus.x)} ${percent(focus.y)}`;
}

/**
 * The background of a card's picture: the Cover when one is chosen, else the newest Snapshot,
 * else the Story's gradient.
 */
export function coverBackground(story: Pick<StorySummary, 'id' | 'coverImagePath' | 'coverFocus'>): string {
    return story.coverImagePath
        ? `url("/api/images/${story.coverImagePath}") ${coverPosition(story.coverFocus)} / cover no-repeat`
        : coverGradient(story.id);
}

/**
 * A card's Cover (audit H34): a WebP thumbnail of the chosen picture, at its focus point, laid over
 * the Story's gradient, so the card has its colours at once and keeps them if the picture fails.
 * 320px wide, 640 on a dense screen; `large` (the Story sheet's banner) takes 640 always.
 */
export function coverThumbBackground(story: Pick<StorySummary, 'id' | 'coverImagePath' | 'coverFocus'>, large = false): string {
    const gradient = coverGradient(story.id);
    if (!story.coverImagePath) return gradient;
    const base = `/api/images/${story.coverImagePath}`;
    const picture = large ? `url("${base}?w=640")` : `image-set(url("${base}?w=320") 1x, url("${base}?w=640") 2x)`;
    return `${picture} ${coverPosition(story.coverFocus)} / cover no-repeat, ${gradient}`;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 365 * 24 * 60 * 60],
    ['month', 30 * 24 * 60 * 60],
    ['week', 7 * 24 * 60 * 60],
    ['day', 24 * 60 * 60],
    ['hour', 60 * 60],
    ['minute', 60],
];

/** "just now", "5 minutes ago", "yesterday", "last week": how long ago a Chat was played. */
export function playedAgo(iso: string, now: Date = new Date()): string {
    const seconds = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000);
    const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    for (const [unit, size] of UNITS) {
        if (seconds >= size) return format.format(-Math.floor(seconds / size), unit);
    }
    return 'just now';
}

/** A playable Story that has a Chat to go back to. */
export type ContinuableStory = StorySummary & {
    latestChat: LatestChat;
    lastPlayedAt: string;
};

function continuable(story: StorySummary): story is ContinuableStory {
    // A Draft's sheet offers no play, so the row doesn't either.
    return story.playable && story.latestChat !== null && story.lastPlayedAt !== null;
}

/** The playable Story whose Chat was played most recently, for the "Continue where you left off" row. */
export function newestPlayed(stories: StorySummary[]): ContinuableStory | null {
    let newest: ContinuableStory | null = null;
    for (const story of stories) {
        if (!continuable(story)) continue;
        if (!newest || Date.parse(story.lastPlayedAt) > Date.parse(newest.lastPlayedAt)) newest = story;
    }
    return newest;
}

/** What a Draft's sheet says instead of the play buttons: "3 things to fill in before you can play." */
export function stillToFillIn(count: number): string {
    return `${count} ${count === 1 ? 'thing' : 'things'} to fill in before you can play.`;
}

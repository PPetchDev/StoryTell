import { overusedIn, overusedPerThousand } from '../../src/manager/chat/speech/overused.js';
import { repeatedPhrases } from '../../src/manager/chat/speech/repeated-phrases.js';

/**
 * How worn a scene's replies read, found in code (.scratch/prompt-evals/spec.md, "Prose"): the
 * words and three-word phrases models overuse against human writing, counted a thousand words
 * (the app's own count, which the play-signals report reads too), and the phrases several samples
 * of one scene share. A number to watch from run to run, not a check: nothing here passes or fails.
 */

/** How many of the most found words and phrases a scene names. */
const NAMED_HITS = 5;

export interface SceneProse {
    /** The words of the scene's replies, all samples together. */
    words: number;
    /** Listed words and phrases found, a thousand words. */
    slopPerThousand: number;
    /** The most found, each with its count over the samples. */
    hits: { phrase: string; count: number }[];
    /** Phrases two or more of the samples share, as the app's own repeated-phrases detector finds them. */
    shared: string[];
}

/** What the replies of one scene come to. `names` are the scene's own people, whose names are no fault. */
export function proseOf(replies: readonly string[], names: readonly string[] = []): SceneProse {
    const overused = overusedIn(replies, names);
    return {
        words: overused.words,
        slopPerThousand: overusedPerThousand(overused),
        hits: [...overused.found.entries()]
            .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
            .slice(0, NAMED_HITS)
            .map(([phrase, count]) => ({ phrase, count })),
        shared: repeatedPhrases(replies, names),
    };
}

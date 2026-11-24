import { OVERUSED_PHRASES, OVERUSED_WORDS } from './slop-lists.js';

/**
 * Overused words and phrases in replies, counted in code (.scratch/prompt-evals/spec.md, "Prose"):
 * the words and three-word phrases language models overuse against human writing. A count to watch,
 * never a verdict: "leaned" and "nodded" are on the list, and are how any scene is told. Read by
 * the prompt eval run's scorecard and by the play-signals report. Pure: no model is asked.
 *
 * The lists are sam-paech/slop-score's (slop-lists.ts). Its own score also weighs "not X, but Y"
 * patterns and scales against its leaderboard; this is the plain count of its listed words and
 * phrases, so the two numbers are not the same scale.
 */

/** The common words the phrase list was built without (NLTK's English stopwords, as slop-score uses them). */
const STOPWORDS = new Set(
    `i me my myself we our ours ourselves you your yours yourself yourselves he him his himself she her hers herself
    it its itself they them their theirs themselves what which who whom this that these those am is are was were be
    been being have has had having do does did doing a an the and but if or because as until while of at by for
    with about against between into through during before after above below to from up down in out on off over under
    again further then once here there when where why how all any both each few more most other some such no nor not
    only own same so than too very s t can will just don should now`.split(/\s+/),
);

export interface Overused {
    /** The words of the replies, all together. */
    words: number;
    /** Each listed word or phrase found, with how often. */
    found: Map<string, number>;
}

/** A reply's words in lower case, without its `@Name:` prefixes. */
function wordsOf(text: string): string[] {
    const plain = text
        .replace(/^\s*\**@[^:\n@]{1,60}:/gm, ' ')
        .toLowerCase()
        .replace(/[‘’`]/g, "'");
    return (plain.match(/[a-z']+/g) ?? []).map((word) => word.replace(/^'+|'+$/g, '')).filter((word) => word !== '');
}

/**
 * The listed words and phrases in `replies`. `names` are the Story's own people: a listed name
 * ("elara") is worn when a model picks it freely, and no fault when the Story named the Character.
 */
export function overusedIn(replies: readonly string[], names: readonly string[] = []): Overused {
    const nameWords = new Set(names.flatMap((name) => name.toLowerCase().split(/\s+/)));
    const found = new Map<string, number>();
    const hit = (phrase: string) => found.set(phrase, (found.get(phrase) ?? 0) + 1);
    let words = 0;
    for (const reply of replies) {
        const tokens = wordsOf(reply);
        words += tokens.length;
        for (const token of tokens) if (OVERUSED_WORDS.has(token) && !nameWords.has(token)) hit(token);
        const content = tokens.filter((token) => !STOPWORDS.has(token));
        for (let at = 0; at + 3 <= content.length; at++) {
            const phrase = content.slice(at, at + 3).join(' ');
            if (OVERUSED_PHRASES.has(phrase)) hit(phrase);
        }
    }
    return { words, found };
}

/** How many were found, a thousand words; nothing for no words. */
export function overusedPerThousand(overused: Overused): number {
    const total = [...overused.found.values()].reduce((sum, count) => sum + count, 0);
    return overused.words === 0 ? 0 : (total / overused.words) * 1000;
}

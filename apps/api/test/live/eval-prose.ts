import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repeatedPhrases } from '../../src/manager/chat/speech/repeated-phrases.js';

/**
 * How worn a scene's replies read, found in code (.scratch/prompt-evals/spec.md, "Prose"): the
 * words and three-word phrases models overuse against human writing, counted a thousand words,
 * and the phrases several samples of one scene share. A number to watch from run to run, not a
 * check: nothing here passes or fails. Pure: no model is asked.
 *
 * The lists are sam-paech/slop-score's (MIT, see slop-lists/NOTICE.md). Its own score also weighs
 * "not X, but Y" patterns and scales against its leaderboard; this is the plain count of its
 * listed words and trigrams, so the two numbers are not the same scale.
 */

const LISTS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'slop-lists');

function list(file: string): Set<string> {
    const entries = JSON.parse(readFileSync(path.join(LISTS, file), 'utf8')) as string[][];
    return new Set(entries.map((entry) => entry[0].toLowerCase()));
}

const SLOP_WORDS = list('slop_list.json');
/** Three content words in a row, the common words between them left out: "took (a) deep breath". */
const SLOP_TRIGRAMS = list('slop_list_trigrams.json');

/** The common words the trigram list was built without (NLTK's English stopwords, as slop-score uses them). */
const STOPWORDS = new Set(
    `i me my myself we our ours ourselves you your yours yourself yourselves he him his himself she her hers herself
    it its itself they them their theirs themselves what which who whom this that these those am is are was were be
    been being have has had having do does did doing a an the and but if or because as until while of at by for
    with about against between into through during before after above below to from up down in out on off over under
    again further then once here there when where why how all any both each few more most other some such no nor not
    only own same so than too very s t can will just don should now`.split(/\s+/),
);

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

/** A reply's words in lower case, without its `@Name:` prefixes. */
function wordsOf(text: string): string[] {
    const plain = text
        .replace(/^\s*\**@[^:\n@]{1,60}:/gm, ' ')
        .toLowerCase()
        .replace(/[‘’`]/g, "'");
    return (plain.match(/[a-z']+/g) ?? []).map((word) => word.replace(/^'+|'+$/g, '')).filter((word) => word !== '');
}

/**
 * What the replies of one scene come to. `names` are the scene's own people: a listed name
 * ("elara") is worn when a model picks it freely, and no fault when the Story named the Character.
 */
export function proseOf(replies: readonly string[], names: readonly string[] = []): SceneProse {
    const nameWords = new Set(names.flatMap((name) => name.toLowerCase().split(/\s+/)));
    const found = new Map<string, number>();
    const hit = (phrase: string) => found.set(phrase, (found.get(phrase) ?? 0) + 1);
    let words = 0;
    for (const reply of replies) {
        const tokens = wordsOf(reply);
        words += tokens.length;
        for (const token of tokens) if (SLOP_WORDS.has(token) && !nameWords.has(token)) hit(token);
        const content = tokens.filter((token) => !STOPWORDS.has(token));
        for (let at = 0; at + 3 <= content.length; at++) {
            const trigram = content.slice(at, at + 3).join(' ');
            if (SLOP_TRIGRAMS.has(trigram)) hit(trigram);
        }
    }
    const total = [...found.values()].reduce((sum, count) => sum + count, 0);
    return {
        words,
        slopPerThousand: words === 0 ? 0 : (total / words) * 1000,
        hits: [...found.entries()]
            .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
            .slice(0, NAMED_HITS)
            .map(([phrase, count]) => ({ phrase, count })),
        shared: repeatedPhrases(replies, names),
    };
}

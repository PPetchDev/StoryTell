/**
 * Phrases the recent AI replies keep reusing (.scratch/story-quality/spec.md, "Repeated phrases"),
 * found in code: a run of four or more words that appears in two or more of the last few replies
 * ("I had a whole speech ready" three replies in a row, "her tail wraps around my wrist" in nearly
 * every one, live Chat 2, 2026-11-17). A run made of common words and names ("Nara looks at
 * Petch", "I don't know what") is how any story talks, and is left alone. Pure: no model is asked.
 */

/** How many of the newest AI replies are read. */
export const REPEAT_WINDOW = 4;
/** In how many of them a run must appear. */
export const REPEAT_MIN_REPLIES = 2;
/** The words in a run. */
export const REPEAT_RUN_WORDS = 4;
/**
 * The fewest words in a phrase: two runs in a row. Four alone were mostly places on dev Chat 2 ("at
 * her tent flap", "on the flat stone"), which a story names again as it should; the beats ran longer.
 */
export const REPEAT_MIN_WORDS = 5;
/** The most phrases named, and the most words in one. */
export const REPEAT_MAX_PHRASES = 4;
export const REPEAT_MAX_WORDS = 10;
/** A run needs this many words that are neither common nor a name. */
const MIN_CONTENT_WORDS = 2;

/**
 * Words that carry no beat of their own: articles, pronouns, prepositions, conjunctions,
 * auxiliaries, and a few everyday verbs and adverbs every reply uses.
 */
const COMMON_WORDS = new Set(
    `a an the and or but nor so yet if then than as of at by for from in into on onto off out over under up down to with
    without about around through across after before behind between toward towards against along past near
    i me my mine myself you your yours yourself he him his himself she her hers herself it its itself we us our ours
    they them their theirs themselves this that these those there here who whom whose what which when where why how
    is am are was were be been being have has had having do does did doing done will would shall should can could may
    might must not no don't doesn't didn't isn't aren't wasn't weren't won't can't couldn't wouldn't shouldn't i'm i'll
    i'd i've you're you'll you'd you've he's she's it's we're they're that's there's what's let's
    just still only even all some any one more most very too also again now then back away
    say says said saying tell tells told look looks looked looking see sees saw seen know knows knew think thinks thought
    want wants wanted get gets got go goes went going come comes came make makes made take takes took let lets
    like yes oh well okay ok
    something anything nothing everything somewhere time times way moment long little side middle first last own other`.split(/\s+/),
);

/** A run of words as found: compared in lower case, named in the reply's own words. */
interface Token {
    key: string;
    word: string;
}

/** A reply as lists of words, one list per sentence or line, without `@Name:` prefixes or stage directions. */
function segmentsOf(text: string): Token[][] {
    return text
        .replace(/\*\([^)]*\)\*/g, ' ')
        .replace(/^@[^:\n]+:/gm, '\n')
        .split(/[.!?…:;—–\n]+|\s-\s/)
        .map((segment) =>
            segment
                .replace(/[“”"‘*_()[\]]/g, ' ')
                .replace(/’/g, "'")
                .split(/[\s,]+/)
                .map((raw) => raw.replace(/^'+|'+$/g, '').replace(/[^A-Za-z0-9']/g, ''))
                .filter((word) => word !== '')
                .map((word) => ({ key: word.toLowerCase(), word })),
        )
        .filter((segment) => segment.length > 0);
}

/** The phrases repeated across `replies` (oldest first), as the newest of them words each; none, empty. */
export function repeatedPhrases(replies: readonly string[], names: readonly string[] = []): string[] {
    const recent = replies.slice(-REPEAT_WINDOW);
    if (recent.length < REPEAT_MIN_REPLIES) return [];
    const nameWords = new Set(names.flatMap((name) => name.toLowerCase().split(/\s+/)).flatMap((word) => [word, `${word}'s`]));
    const plain = (key: string) => COMMON_WORDS.has(key) || nameWords.has(key) || /^\d+$/.test(key);
    const segmented = recent.map(segmentsOf);
    const runKey = (segment: Token[], at: number) =>
        segment
            .slice(at, at + REPEAT_RUN_WORDS)
            .map((token) => token.key)
            .join(' ');

    // In how many replies each run appears, counted once a reply.
    const seenIn = new Map<string, number>();
    for (const segments of segmented) {
        const runs = new Set<string>();
        for (const segment of segments) {
            for (let at = 0; at + REPEAT_RUN_WORDS <= segment.length; at++) runs.add(runKey(segment, at));
        }
        for (const run of runs) seenIn.set(run, (seenIn.get(run) ?? 0) + 1);
    }
    const repliesOf = (segment: Token[], at: number) => seenIn.get(runKey(segment, at)) ?? 0;
    // A run that carries a beat: at least two words that are neither common nor a name.
    const carries = (segment: Token[], at: number) =>
        segment.slice(at, at + REPEAT_RUN_WORDS).filter((token) => !plain(token.key)).length >= MIN_CONTENT_WORDS;

    // Newest reply first: a stretch of neighbouring repeated runs in a segment is one phrase, kept
    // when one of its runs carries a beat ("I had a whole speech ready" keeps its "I had a").
    const found: Array<{ key: string; phrase: string; replies: number; words: number }> = [];
    for (const segments of [...segmented].reverse()) {
        for (const segment of segments) {
            let at = 0;
            while (at + REPEAT_RUN_WORDS <= segment.length) {
                if (repliesOf(segment, at) < REPEAT_MIN_REPLIES) {
                    at++;
                    continue;
                }
                let last = at;
                while (last + 1 + REPEAT_RUN_WORDS <= segment.length && repliesOf(segment, last + 1) >= REPEAT_MIN_REPLIES) last++;
                let replies = 0;
                for (let run = at; run <= last; run++) if (carries(segment, run)) replies = Math.max(replies, repliesOf(segment, run));
                if (replies > 0 && last + REPEAT_RUN_WORDS - at >= REPEAT_MIN_WORDS) {
                    const words = segment.slice(at, last + REPEAT_RUN_WORDS).slice(0, REPEAT_MAX_WORDS);
                    found.push({
                        key: words.map((token) => token.key).join(' '),
                        phrase: words.map((token) => token.word).join(' '),
                        replies,
                        words: words.length,
                    });
                }
                at = last + 1;
            }
        }
    }

    // Newest wording first: a phrase sharing a run with one already kept is the same beat told again.
    const kept: typeof found = [];
    const keptRuns = new Set<string>();
    for (const candidate of found) {
        const words = candidate.key.split(' ');
        const runs = words.slice(0, words.length - REPEAT_RUN_WORDS + 1).map((_, at) => words.slice(at, at + REPEAT_RUN_WORDS).join(' '));
        if (runs.some((run) => keptRuns.has(run))) continue;
        for (const run of runs) keptRuns.add(run);
        kept.push(candidate);
    }
    return kept
        .sort((a, b) => b.replies - a.replies || b.words - a.words)
        .slice(0, REPEAT_MAX_PHRASES)
        .map((entry) => entry.phrase);
}

/** The line before the turn's final instruction naming the repeated phrases; null with none. */
export function repeatedPhrasesLine(phrases: readonly string[]): string | null {
    if (phrases.length === 0) return null;
    return `Already used in recent replies, so not again in this one: ${phrases.map((phrase) => `"${phrase}"`).join('; ')}. Find a fresh way, or leave it out.`;
}

/** What the Story so far trigger reserves for the line, which it can't know in advance. */
export const REPEATS_RESERVE_TOKENS = 80;

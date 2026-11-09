import { estimateTokens } from '../chat/turn/prompt-tokens.js';

/** A passage aims for about this many estimated tokens (.scratch/documents/spec.md: "Splitting into passages"). */
export const PASSAGE_TARGET_TOKENS = 400;
/** And never holds more. */
export const PASSAGE_MAX_TOKENS = 500;
/** Each passage after the first opens with about this much of the one before. */
export const PASSAGE_OVERLAP_TOKENS = 60;

/** `estimateTokens` counts four characters a token, so token sizes are character sizes. */
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = PASSAGE_MAX_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = PASSAGE_OVERLAP_TOKENS * CHARS_PER_TOKEN;

/** A piece of a paragraph no bigger than a passage, and how it joins the piece before it. */
interface Unit {
    text: string;
    /** `\n\n` when it opens a paragraph, a space after a sentence end, nothing after a hard split. */
    joiner: string;
}

/** Line endings normalised, trailing spaces of blank lines dropped, runs of blank lines collapsed to one. */
export function normaliseDocumentText(text: string): string {
    return text
        .replace(/\r\n?/g, '\n')
        .replace(/\n[ \t]*(?=\n)/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Sentence ends: `.`, `!`, `?` or `…` (with any closing quotes or brackets) before whitespace,
 * and the space Thai puts between sentences, between two Thai characters.
 */
const SENTENCE_BREAK = /(?<=[.!?…]["'”’)\]]*)\s+|(?<=[฀-๿])[ \t]+(?=[฀-๿])/u;

/** A paragraph's sentences, in order. */
function sentencesOf(paragraph: string): string[] {
    return paragraph.split(SENTENCE_BREAK).filter((sentence) => sentence !== '');
}

/**
 * Cuts a text with no sentence end small enough at the most a passage holds: at the last
 * whitespace in the second half of each window, else exactly there (never inside a
 * surrogate pair).
 */
function hardSplit(text: string): Unit[] {
    const units: Unit[] = [];
    let rest = text;
    let joiner = '';
    while (rest.length > MAX_CHARS) {
        let cut = MAX_CHARS;
        const space = rest.slice(0, MAX_CHARS + 1).search(/\s\S*$/);
        if (space >= MAX_CHARS / 2) cut = space;
        else if (/[\uDC00-\uDFFF]/.test(rest[cut])) cut -= 1;
        units.push({ text: rest.slice(0, cut).trimEnd(), joiner });
        const next = rest.slice(cut);
        joiner = /^\s/.test(next) ? ' ' : '';
        rest = next.trimStart();
    }
    if (rest !== '') units.push({ text: rest, joiner });
    return units;
}

/**
 * A paragraph as units no bigger than a passage: whole when it fits in one, else its
 * sentences, and a sentence too long for one passage in hard splits.
 */
function unitsOf(paragraph: string): Unit[] {
    if (paragraph.length <= MAX_CHARS) return [{ text: paragraph, joiner: '\n\n' }];
    const units = sentencesOf(paragraph).flatMap((sentence): Unit[] => {
        if (sentence.length <= MAX_CHARS) return [{ text: sentence, joiner: ' ' }];
        const pieces = hardSplit(sentence);
        pieces[0].joiner = ' ';
        return pieces;
    });
    units[0].joiner = '\n\n';
    return units;
}

/**
 * The end of a passage to open the next one with: its last whole sentences that fit in about
 * the overlap, or, when not even the last one fits, its last words up to it. At most `max`
 * characters.
 */
function overlapOf(passage: string, max: number): string {
    const budget = Math.min(OVERLAP_CHARS, max);
    if (budget <= 0) return '';
    const lastParagraph = passage.slice(passage.lastIndexOf('\n\n') + 1).trim();
    const sentences = sentencesOf(lastParagraph);
    let taken = '';
    for (let at = sentences.length - 1; at >= 0; at--) {
        const candidate = taken === '' ? sentences[at] : `${sentences[at]} ${taken}`;
        if (candidate.length > budget) break;
        taken = candidate;
    }
    if (taken !== '') return taken;
    // Start at a word, when there is a space to start at, and never on a combining mark (Thai's vowels and tones).
    const tail = lastParagraph.slice(-budget).replace(/^[\p{M}\uDC00-\uDFFF]+/u, '');
    const word = tail.search(/\s\S/);
    return word >= 0 && word < tail.length / 2 ? tail.slice(word + 1) : tail;
}

/**
 * Splits a Document's text into passages (.scratch/documents/spec.md: "Splitting into
 * passages"). Pure. Paragraphs are packed into passages of about 400 estimated tokens and at
 * most 500; a paragraph too long for one is split at sentence ends, and failing those at the
 * most a passage holds. Each passage after the first opens with about the last 60 estimated
 * tokens of the one before, as whole sentences where possible, so a fact split across a
 * boundary is still found. Markdown is kept as written.
 */
export function splitPassages(text: string): string[] {
    const normalised = normaliseDocumentText(text);
    if (normalised === '') return [];
    const units = normalised.split('\n\n').flatMap(unitsOf);

    const passages: string[] = [];
    let current = units[0].text;
    for (const unit of units.slice(1)) {
        const joined = current + unit.joiner + unit.text;
        if (estimateTokens(joined) <= PASSAGE_TARGET_TOKENS) {
            current = joined;
            continue;
        }
        passages.push(current);
        // The overlap fits beside the unit, within the most a passage holds.
        const separator = unit.joiner === '\n\n' ? '\n\n' : ' ';
        const overlap = overlapOf(current, MAX_CHARS - unit.text.length - separator.length);
        current = overlap === '' ? unit.text : overlap + separator + unit.text;
    }
    passages.push(current);
    return passages;
}

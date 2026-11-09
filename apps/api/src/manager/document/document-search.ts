import { estimateTokens } from '../chat/turn/prompt-tokens.js';

/** Spec: "Selection". Passages scoring under this are never sent; tuned in ticket 09. */
export const DOCUMENT_MIN_SIMILARITY = 0.45;
/** At most this many passages a turn. */
export const DOCUMENT_MAX_PASSAGES = 4;
/** The block's passages fit under this many estimated tokens. */
export const DOCUMENT_CAP_TOKENS = 1_000;
/** The query is cut to about this many estimated tokens, from the newest end. */
export const DOCUMENT_QUERY_TOKENS = 1_500;
/** The Messages before the point the query reads, besides the user's new message: the Lore scan window. */
export const DOCUMENT_QUERY_MESSAGES = 4;
/** How many top scores each search logs. */
export const DOCUMENT_LOGGED_SCORES = 5;

/** A passage's heading when its Document's title is blank. */
export const UNTITLED_DOCUMENT = 'Untitled Document';

/** The block's heading; tests find the block by it. */
export const DOCUMENTS_HEADING = '# From the Story\'s Documents';

/** A stored passage as a turn compares it: its vector at unit length, and the model that made it. */
export interface SearchablePassage {
    id: number;
    documentId: number;
    position: number;
    text: string;
    embedding: number[];
    /** The `embedding_model` of its Document. */
    model: string;
}

/** A passage as the block shows it. */
export interface PromptPassage {
    documentTitle: string;
    text: string;
}

export interface ScoredPassage {
    passage: SearchablePassage;
    score: number;
    /** Whether it was selected to be sent. */
    sent: boolean;
}

export interface PassageSelection {
    /** The passages to send, highest score first. */
    selected: SearchablePassage[];
    /** Every comparable passage with its score, highest first. */
    scored: ScoredPassage[];
    /** Passages embedded by another model than the query's, never compared. */
    otherModel: SearchablePassage[];
}

export interface SelectionOptions {
    floor?: number;
    maxPassages?: number;
    capTokens?: number;
}

/** A vector scaled to unit length, so cosine similarity is a dot product. */
export function unitLength(vector: number[]): number[] {
    const length = Math.hypot(...vector);
    return length === 0 ? vector : vector.map((value) => value / length);
}

/** Their dot product: cosine similarity, both being at unit length. Vectors of another size score nothing. */
export function similarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let sum = 0;
    for (let at = 0; at < a.length; at++) sum += a[at] * b[at];
    return sum;
}

/**
 * Which passages a turn sends (.scratch/documents/spec.md: "Selection"). Pure. Every passage of
 * the query's model is scored by cosine similarity; those under the floor are dropped; the
 * highest go first, at most 4, while their text fits under the cap. One that doesn't fit is
 * skipped while the rest are still tried. Passages of another model are left out.
 */
export function selectPassages(
    passages: SearchablePassage[],
    query: number[],
    queryModel: string,
    options: SelectionOptions = {},
): PassageSelection {
    const floor = options.floor ?? DOCUMENT_MIN_SIMILARITY;
    const maxPassages = options.maxPassages ?? DOCUMENT_MAX_PASSAGES;
    const cap = options.capTokens ?? DOCUMENT_CAP_TOKENS;
    const otherModel = passages.filter((passage) => passage.model !== queryModel);
    const scored = passages
        .filter((passage) => passage.model === queryModel)
        .map((passage) => ({ passage, score: similarity(passage.embedding, query), sent: false }))
        // Ties keep Document and passage order.
        .sort((a, b) => b.score - a.score || a.passage.documentId - b.passage.documentId || a.passage.position - b.passage.position);

    const selected: SearchablePassage[] = [];
    let used = 0;
    for (const candidate of scored) {
        if (selected.length >= maxPassages || candidate.score < floor) break;
        const cost = estimateTokens(candidate.passage.text);
        if (used + cost > cap) continue;
        used += cost;
        candidate.sent = true;
        selected.push(candidate.passage);
    }
    return { selected, scored, otherModel };
}

/**
 * What a turn searches with (spec: "The query"): the user's new message (none on a Continue) and
 * the 4 newest Messages before it, newest first, a blank line apart, cut to about 1,500
 * estimated tokens from the newest end. `before` is the Chat's Messages before the user's new
 * one, oldest first, as the prompt reads them.
 */
export function documentQuery(before: Array<{ text: string }>, userText: string | null): string {
    const newestFirst = [...(userText !== null ? [userText] : []), ...before.slice(-DOCUMENT_QUERY_MESSAGES).reverse().map((message) => message.text)];
    const joined = newestFirst.map((text) => text.trim()).filter((text) => text !== '').join('\n\n');
    // `estimateTokens` counts four characters a token.
    return joined.slice(0, DOCUMENT_QUERY_TOKENS * 4);
}

/**
 * The Documents block of a closing message (spec: "The prompt block"), or null when nothing was
 * selected. It goes after the Lore and before the Author's note. A Document whose title was
 * cleared still gets a heading.
 */
export function documentsBlock(passages: PromptPassage[]): string | null {
    if (passages.length === 0) return null;
    return `${DOCUMENTS_HEADING} (passages that bear on this moment: common knowledge of this world, so every Character knows them as anyone living there would; use what fits, never quote them as documents)
${passages.map((passage) => `## ${passage.documentTitle.trim() || UNTITLED_DOCUMENT}\n${passage.text}`).join('\n\n')}`;
}

/**
 * The most the block can take, for the Story so far trigger: the cap plus the heading and each
 * passage's title, or nothing for a Story with no passages.
 */
export function documentsReserveTokens(hasDocuments: boolean | undefined): number {
    if (!hasDocuments) return 0;
    return DOCUMENT_CAP_TOKENS + estimateTokens(documentsBlock([{ documentTitle: '', text: '' }]) ?? '') + DOCUMENT_MAX_PASSAGES * 30;
}

/**
 * The search's debug line (spec: "Scores in the log"): the floor and the top scores, each with
 * its Document's title and passage position, marked when sent. No passage or query text.
 */
export function searchLogLine(
    storyId: number,
    chatId: number,
    selection: PassageSelection,
    titleOf: (documentId: number) => string,
    floor = DOCUMENT_MIN_SIMILARITY,
): string {
    const top = selection.scored
        .slice(0, DOCUMENT_LOGGED_SCORES)
        .map(({ passage, score, sent }) => `${score.toFixed(3)} "${titleOf(passage.documentId)}" #${passage.position}${sent ? ' (sent)' : ''}`);
    return `Story ${storyId}, Chat ${chatId}: Document search, floor ${floor}; top scores: ${top.length > 0 ? top.join(', ') : 'none'}`;
}

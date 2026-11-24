import { CastName, QuotedPiece, ReplyPart, speakerOf, splitQuotedSpeech } from './reply-parser.js';

/**
 * Speech-line repair (.scratch/reply-repair/spec.md, "1. Speech-line repair"): a reply with no
 * speech line at all, whose narration quotes someone speaking, has the quoted words moved onto
 * speech lines of the Character who said them. Seen in a real played Chat (the prompt eval run,
 * 2026-11-24): six replies in a row wrote every word a Character said in quotation marks inside
 * the narration, so in the app the Narrator would have spoken all of it and the Character nothing.
 *
 * Code only, and only where code can tell who spoke: a line in the wrong mouth is worse than
 * none. Whatever it cannot place stays narration, as written. Pure: no model, no database.
 *
 * What it cannot tell, and so risks: with one Character in the Story, `"Evening," he said.` is
 * taken for theirs. The Rules forbid writing the user's words and tell the narration to call the
 * user by name or "they" until their gender is stated, so "he" and "she" are a Character almost
 * always; a model that breaks both rules at once gets the user's words put in the Character's mouth.
 * What it leaves, safely: a quotation that does not open its paragraph (`She said, "Sit."`).
 */

export interface SpeechLineRepair {
    /** The reply's parts, mended; the same parts when nothing moved. */
    parts: ReplyPart[];
    /** How many quotations became speech lines. */
    moved: number;
    /** True when the reply had no speech line and quoted something: a repair was weighed, made or not. */
    considered: boolean;
}

/** A paragraph that opens with a quotation whose words end as spoken words do: `"Sit," she said.`, never `"Character" was what…`. */
const OPENS_WITH_SPOKEN_WORDS = /^\s*["“][^"”]*[.,!?…—–-]\s*["”]/;
const QUOTE = /["“”]/;

/** Verbs a speech tag is made with: who a tag names with one of these said the words. */
const SAYING =
    'said|says|asked|asks|replied|replies|answered|answers|added|adds|repeated|repeats|murmured|murmurs|muttered|mutters|whispered|whispers|called|calls|continued|continues|snapped|snaps|sighed|sighs|laughed|laughs|breathed|breathes|told|tells';

/**
 * Narration after a quotation that says someone else said it, or that it was not said at all: a
 * person or thing named by what it is, with a verb of saying, reading or naming (`the ferryman
 * called`, `her mother had once said`, `the sign read`, `the book was called`).
 */
const SOMEONE_ELSE = new RegExp(`^(?:the|a|an|another|her|his|their|its|my|your|some|that|this)\\s+[\\p{L}'’-]+(?:\\s+[\\p{L}'’-]+)?\\s+(?:had\\s+)?(?:once\\s+)?(?:${SAYING}|read|reads|was called|is called)\\b`, 'iu');
/** Words remembered, not said now: `she had once said`, `he used to say`. */
const REMEMBERED = /\b(?:had (?:once |always )?(?:said|told|written)|used to say|once said)\b/i;
/** Narration that opens with one of these may be the user's character, whom the narration calls "they" until told otherwise, or nobody. */
const NOT_A_CHARACTER = new Set(['they', 'their', 'them', 'it', 'its', 'you', 'your', 'i', 'my', 'we', 'our']);

const firstWord = (text: string): string => (text.match(/\p{L}[\p{L}'’-]*/u)?.[0] ?? '').toLowerCase();
const nameWords = (name: string): string[] => name.toLowerCase().split(/\s+/).filter(Boolean);
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A speech tag with nothing else in it ("She said.", "Nara asked."): once the words are a speech line it says nothing. */
function isBareTag(narration: string, speakerName: string): boolean {
    const names = nameWords(speakerName).map(escapeRegExp);
    return new RegExp(`^(?:she|he|${names.join('|')}|${names.join('\\s+')})\\s+(?:${SAYING})[.!]?$`, 'i').test(narration.trim());
}

/** Whether narration beside a Character's quoted words can stand there: not the user's character speaking, not someone else, not a memory. */
function besideTheirWords(narration: string, identityName: string): boolean {
    const first = firstWord(narration);
    if (NOT_A_CHARACTER.has(first) || nameWords(identityName).includes(first)) return false;
    return !SOMEONE_ELSE.test(narration.trim()) && !REMEMBERED.test(narration);
}

/**
 * Who a paragraph's quotations belong to, of the Characters who may speak. One Character alone:
 * theirs, when the narration beside the words allows it. Several: only the one the tag right after
 * the first quotation names with a verb of saying (`"Hand me that," Nara said`); "she said" names
 * nobody, and a name with another verb (`Bram heard…`, `Bram watched…`) may be the listener.
 */
function speakerOfParagraph(paragraph: string, speakers: CastName[]): CastName | undefined {
    if (speakers.length === 1) return speakers[0];
    const tag = paragraph.replace(OPENS_WITH_SPOKEN_WORDS, '').trimStart();
    const named = new RegExp(`^([\\p{L}'’-]+(?:\\s+[\\p{L}'’-]+)?)\\s+(?:${SAYING})\\b`, 'iu').exec(tag)?.[1];
    if (!named) return undefined;
    // The whole name, or one word of it that only one Character has: the reply parser's rule for a speech line's name.
    return speakers.find((speaker) => speaker.name.toLowerCase() === named.toLowerCase()) ?? (/\s/.test(named) ? undefined : speakerOf(speakers, named));
}

/** The paragraph as speech and narration pieces when all of it can be given to one Character; null when any of it is in doubt. */
function piecesOf(paragraph: string, speakers: CastName[], identityName: string): { speaker: CastName; pieces: QuotedPiece[] } | null {
    if (!OPENS_WITH_SPOKEN_WORDS.test(paragraph)) return null;
    const speaker = speakerOfParagraph(paragraph, speakers);
    // The splitter's own guard holds here too: every piece between the quotations must read as narration about the speaker.
    const pieces = speaker ? splitQuotedSpeech(paragraph, speaker.name) : null;
    if (!speaker || !pieces) return null;
    return pieces.every((piece) => piece.kind === 'speech' || besideTheirWords(piece.text, identityName)) ? { speaker, pieces } : null;
}

/**
 * The reply with its quoted speech on speech lines. `speakers` are the Story's Characters who are
 * not sitting out; `identityName` is the worn identity's. A reply that already has a speech line is
 * never touched: there a quotation in the narration is the Narrator quoting, not the reply's way of
 * writing speech.
 */
export function repairSpeechLines(parts: ReplyPart[], speakers: CastName[], identityName: string): SpeechLineRepair {
    const untouched = { parts, moved: 0 };
    if (parts.some((part) => part.kind === 'speech')) return { ...untouched, considered: false };
    if (!parts.some((part) => QUOTE.test(part.text))) return { ...untouched, considered: false };
    if (speakers.length === 0) return { ...untouched, considered: true };

    const mended: ReplyPart[] = [];
    let moved = 0;
    const push = (part: ReplyPart): void => {
        const last = mended[mended.length - 1];
        // Narration side by side is one part, as the parser merges it.
        if (part.kind === 'narration' && last?.kind === 'narration') last.text += '\n\n' + part.text;
        else mended.push({ ...part });
    };
    for (const part of parts) {
        // A line is a paragraph here: the parser joins narration lines with one line break.
        for (const paragraph of part.text.split(/\n+/)) {
            const found = piecesOf(paragraph, speakers, identityName);
            if (!found) {
                push({ kind: 'narration', text: paragraph });
                continue;
            }
            for (const piece of found.pieces) {
                if (piece.kind === 'speech') {
                    moved++;
                    push({ kind: 'speech', characterId: found.speaker.id, speakerName: found.speaker.name, text: piece.text });
                } else if (!isBareTag(piece.text, found.speaker.name)) {
                    push({ kind: 'narration', text: piece.text });
                }
            }
        }
    }
    return moved > 0 ? { parts: mended, moved, considered: true } : { ...untouched, considered: true };
}

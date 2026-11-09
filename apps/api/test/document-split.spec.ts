import {
    normaliseDocumentText,
    PASSAGE_MAX_TOKENS,
    PASSAGE_OVERLAP_TOKENS,
    PASSAGE_TARGET_TOKENS,
    splitPassages,
} from '../src/manager/document/split-passages.js';
import { estimateTokens } from '../src/manager/chat/turn/prompt-tokens.js';

/** A sentence of about `words` words, numbered so every one is unique. */
const sentence = (n: number, words = 12) => `Sentence ${n} tells of the ${Array.from({ length: words - 6 }, (_, at) => `word${at}`).join(' ')} harbour.`;
/** A paragraph of `count` sentences numbered from `from`. */
const paragraph = (from: number, count: number) => Array.from({ length: count }, (_, at) => sentence(from + at)).join(' ');

// Spec: Documents, "Splitting into passages".
describe('Splitting a Document into passages', () => {
    it('normalises line endings and collapses runs of blank lines, keeping Markdown as written', () => {
        expect(normaliseDocumentText('  # Title\r\n\r\n\r\n   \r\n- one\r- two\n\n\n\nEnd.  ')).toBe('# Title\n\n- one\n- two\n\nEnd.');
        expect(splitPassages('# Title\r\n\r\n\r\n- one\n- **two**')).toEqual(['# Title\n\n- one\n- **two**']);
    });

    it('answers nothing for blank text', () => {
        expect(splitPassages(' \n\n \t ')).toEqual([]);
    });

    it('packs paragraphs into passages of about 400 and at most 500 estimated tokens', () => {
        // 30 paragraphs of 5 sentences (about 100 tokens each): about 3,000 tokens.
        const paragraphs = Array.from({ length: 30 }, (_, at) => paragraph(at * 5, 5));
        const passages = splitPassages(paragraphs.join('\n\n'));

        expect(passages.length).toBeGreaterThanOrEqual(7);
        expect(passages.length).toBeLessThanOrEqual(10);
        for (const passage of passages) expect(estimateTokens(passage)).toBeLessThanOrEqual(PASSAGE_MAX_TOKENS);
        // All but the last are full: within a paragraph of the target.
        for (const passage of passages.slice(0, -1)) {
            expect(estimateTokens(passage)).toBeGreaterThan(PASSAGE_TARGET_TOKENS - 110);
            expect(estimateTokens(passage)).toBeLessThanOrEqual(PASSAGE_TARGET_TOKENS);
        }
        // Paragraphs are kept whole: each passage's body starts at a paragraph.
        for (const passage of passages.slice(1)) expect(passage).toMatch(/\n\nSentence \d+ tells/);
        // Nothing is lost.
        for (let n = 0; n < 150; n++) expect(passages.some((passage) => passage.includes(`Sentence ${n} tells`))).toBe(true);
    });

    it('opens each passage after the first with about the last 60 tokens of the one before, as whole sentences', () => {
        const passages = splitPassages(Array.from({ length: 12 }, (_, at) => paragraph(at * 5, 5)).join('\n\n'));
        expect(passages.length).toBeGreaterThan(1);

        for (let at = 1; at < passages.length; at++) {
            const [overlap] = passages[at].split('\n\n');
            expect(estimateTokens(overlap)).toBeLessThanOrEqual(PASSAGE_OVERLAP_TOKENS);
            expect(estimateTokens(overlap)).toBeGreaterThan(PASSAGE_OVERLAP_TOKENS / 3);
            // Whole sentences, from the very end of the passage before.
            expect(overlap).toMatch(/^Sentence \d+ tells .* harbour\.$/);
            expect(passages[at - 1].endsWith(overlap)).toBe(true);
        }
    });

    it('splits a paragraph too long for one passage at sentence ends', () => {
        // One paragraph of 120 sentences: about 2,400 tokens.
        const passages = splitPassages(paragraph(0, 120));

        expect(passages.length).toBeGreaterThanOrEqual(6);
        for (const passage of passages) {
            expect(estimateTokens(passage)).toBeLessThanOrEqual(PASSAGE_MAX_TOKENS);
            expect(passage).toMatch(/^Sentence \d+ tells/);
            expect(passage).toMatch(/harbour\.$/);
        }
        for (let n = 0; n < 120; n++) expect(passages.some((passage) => passage.includes(`Sentence ${n} tells`))).toBe(true);
    });

    it('splits text with no sentence end at the most a passage holds, at a space where it can', () => {
        const words = Array.from({ length: 1500 }, (_, at) => `w${at}`).join(' ');
        const passages = splitPassages(words);

        expect(passages.length).toBeGreaterThan(1);
        for (const passage of passages) {
            expect(estimateTokens(passage)).toBeLessThanOrEqual(PASSAGE_MAX_TOKENS);
            // Never inside a word.
            expect(passage).toMatch(/^w\d+( w\d+)*$/);
        }
        expect(passages.at(-1)).toMatch(/w1499$/);
    });

    it('cuts a run with no spaces at all at exactly the most', () => {
        const passages = splitPassages('x'.repeat(5000));
        for (const passage of passages) expect(estimateTokens(passage)).toBeLessThanOrEqual(PASSAGE_MAX_TOKENS);
        expect(passages.join('').replace(/\s/g, '').length).toBeGreaterThanOrEqual(5000);
    });

    it('splits Thai at the spaces between its sentences', () => {
        const thai = Array.from({ length: 200 }, (_, at) => `ประโยคที่${at}เล่าเรื่องประภาคารบนหน้าผาทางทิศเหนือ`).join(' ');
        const passages = splitPassages(thai);

        expect(passages.length).toBeGreaterThan(1);
        for (const passage of passages) {
            expect(estimateTokens(passage)).toBeLessThanOrEqual(PASSAGE_MAX_TOKENS);
            // Whole Thai sentences only: each piece between spaces is one sentence.
            for (const piece of passage.split(' ')) expect(piece).toMatch(/^ประโยคที่\d+เล่าเรื่องประภาคารบนหน้าผาทางทิศเหนือ$/);
        }
        for (let n = 0; n < 200; n++) expect(passages.some((passage) => passage.includes(`ประโยคที่${n}เล่า`))).toBe(true);
    });
});

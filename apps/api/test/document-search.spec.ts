import {
    DOCUMENT_CAP_TOKENS,
    DOCUMENT_MIN_SIMILARITY,
    documentQuery,
    DOCUMENTS_HEADING,
    documentsBlock,
    SearchablePassage,
    searchLogLine,
    selectPassages,
    unitLength,
} from '../src/manager/document/document-search.js';
import { LORE_HEADING } from '../src/manager/chat/lore/lore-select.js';
import { storySoFarCoverage } from '../src/manager/chat/story-so-far/story-so-far-prompt.js';
import { buildSuggestionsPrompt } from '../src/manager/chat/suggestions/suggestions-prompt.js';
import { buildTurnPrompt, PromptLayersInput, TURN_PROMPT_TOKEN_BUDGET, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { estimateTokens } from '../src/manager/chat/turn/prompt-tokens.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';

const MODEL = 'bge-m3';
let nextId = 1;

/** A passage whose vector makes the given cosine with the query along axis 0. */
function passage(score: number, fields: Partial<SearchablePassage> = {}): SearchablePassage {
    const id = nextId++;
    return {
        id,
        documentId: 1,
        position: id,
        text: `Passage ${id}.`,
        // The query is the first axis, so the score is the first number.
        embedding: [score, Math.sqrt(1 - score * score), 0],
        model: MODEL,
        ...fields,
    };
}
const QUERY = [1, 0, 0];

function layers(): PromptLayersInput {
    return {
        story: {
            setting: 'A foggy harbour.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Oren', appearance: 'Weathered.', personality: 'Gruff.', voice: 'Short.', exampleLines: [], background: '', secrets: '' }],
        },
        identity: { name: 'Petch', description: 'A new keeper.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
    };
}

function input(overrides: Partial<TurnPromptInput> = {}): TurnPromptInput {
    return {
        ...layers(),
        history: [{ role: 'assistant', text: '@Oren: The lamp is lit.' }],
        userText: 'I climb to the lamp room.',
        ...overrides,
    };
}

const PASSAGES = [
    { documentTitle: 'Gull Point light', text: 'The keeper trims the wick at dusk.' },
    { documentTitle: 'Tide ledger', text: 'Every ship is logged.' },
];

// Spec: Documents, "Selection", "The query", "The prompt block", "Budget".
describe('Document search (pure)', () => {
    describe('selection', () => {
        it('drops passages under the floor and takes the highest first', () => {
            const low = passage(DOCUMENT_MIN_SIMILARITY - 0.01);
            const mid = passage(0.6);
            const high = passage(0.9);
            const atFloor = passage(DOCUMENT_MIN_SIMILARITY);

            const selection = selectPassages([low, mid, high, atFloor], QUERY, MODEL);

            expect(selection.selected.map((p) => p.id)).toEqual([high.id, mid.id, atFloor.id]);
            expect(selection.scored.map((s) => s.passage.id)).toEqual([high.id, mid.id, atFloor.id, low.id]);
            expect(selection.scored.map((s) => s.sent)).toEqual([true, true, true, false]);
        });

        it('sends at most 4 passages', () => {
            const passages = [0.9, 0.85, 0.8, 0.75, 0.7, 0.65].map((score) => passage(score));
            expect(selectPassages(passages, QUERY, MODEL).selected).toEqual(passages.slice(0, 4));
        });

        it('keeps under the token cap, skipping one that does not fit while still trying the rest', () => {
            const big = passage(0.9, { text: 'x'.repeat(DOCUMENT_CAP_TOKENS * 4 - 400) });
            const tooBig = passage(0.8, { text: 'y'.repeat(800) });
            const small = passage(0.7, { text: 'z'.repeat(200) });

            const selection = selectPassages([small, tooBig, big], QUERY, MODEL);

            expect(selection.selected.map((p) => p.id)).toEqual([big.id, small.id]);
            const used = selection.selected.reduce((sum, p) => sum + estimateTokens(p.text), 0);
            expect(used).toBeLessThanOrEqual(DOCUMENT_CAP_TOKENS);
        });

        it("skips another model's passages and answers them apart", () => {
            const old = passage(0.99, { model: 'qwen3-embedding-8b' });
            const ours = passage(0.6);

            const selection = selectPassages([old, ours], QUERY, MODEL);

            expect(selection.selected).toEqual([ours]);
            expect(selection.otherModel).toEqual([old]);
            expect(selection.scored.map((s) => s.passage)).toEqual([ours]);
        });

        it('scales a vector to unit length', () => {
            expect(unitLength([3, 4])).toEqual([0.6, 0.8]);
            expect(unitLength([0, 0])).toEqual([0, 0]);
        });
    });

    describe('the query', () => {
        const history = Array.from({ length: 7 }, (_, at) => ({ text: `Message ${at}` }));

        it("is the user's message and the 4 newest Messages before it, newest first", () => {
            expect(documentQuery(history, 'I ask about the lamp.')).toBe(
                ['I ask about the lamp.', 'Message 6', 'Message 5', 'Message 4', 'Message 3'].join('\n\n'),
            );
        });

        it('is the 4 newest Messages on a Continue', () => {
            expect(documentQuery(history, null)).toBe(['Message 6', 'Message 5', 'Message 4', 'Message 3'].join('\n\n'));
        });

        it('is cut to about 1,500 tokens from the newest end', () => {
            const long = [{ text: `OLDEST ${'old '.repeat(2000)}OLDEST-END` }];
            const query = documentQuery(long, `NEWEST ${'new '.repeat(1000)}NEWEST-END`);

            expect(estimateTokens(query)).toBe(1_500);
            // The newest whole; the oldest only as far as it fits.
            expect(query.startsWith('NEWEST')).toBe(true);
            expect(query).toContain('NEWEST-END');
            expect(query).not.toContain('OLDEST-END');
        });
    });

    describe('the turn prompt', () => {
        const lore = [{ id: 1, name: 'Fog bells', keywords: [], text: 'Bells ring in fog.', alwaysOn: true }];

        it('puts the block after the Lore and before the Author\'s note and "Where things stand"', () => {
            const prompt = buildTurnPrompt(input({ chosenLore: lore, documentPassages: PASSAGES, authorsNote: 'Keep it eerie.' }));
            const trailing = prompt.messages.at(-1)!.content;

            const lorePlace = trailing.indexOf(LORE_HEADING);
            const documentsPlace = trailing.indexOf(DOCUMENTS_HEADING);
            const notePlace = trailing.indexOf("# Author's note");
            const standPlace = trailing.indexOf('Where things stand');
            expect(lorePlace).toBeGreaterThanOrEqual(0);
            expect(documentsPlace).toBeGreaterThan(lorePlace);
            expect(notePlace).toBeGreaterThan(documentsPlace);
            expect(standPlace).toBeGreaterThan(notePlace);
            expect(trailing).toContain(
                "# From the Story's Documents (passages that bear on this moment: common knowledge of this world, so every Character knows them as anyone living there would; use what fits, never quote them as documents)\n## Gull Point light\nThe keeper trims the wick at dusk.\n\n## Tide ledger\nEvery ship is logged.",
            );
        });

        it('leaves the system message, and so the cached prefix, the same with and without Documents', () => {
            const without = buildTurnPrompt(input());
            const withDocuments = buildTurnPrompt(input({ documentPassages: PASSAGES, hasDocuments: true }));

            expect(withDocuments.messages[0]).toEqual(without.messages[0]);
            expect(withDocuments.messages.slice(0, -1)).toEqual(without.messages.slice(0, -1));
        });

        it("heads a passage of a Document whose title was cleared as an untitled Document", () => {
            const block = documentsBlock([{ documentTitle: '  ', text: 'Every ship is logged.' }])!;
            expect(block).toContain('## Untitled Document\nEvery ship is logged.');
            expect(block).not.toMatch(/^## *$/m);
        });

        it('has no block when nothing was selected, and is then exactly as before', () => {
            const without = buildTurnPrompt(input());
            const nothingFound = buildTurnPrompt(input({ documentPassages: [], hasDocuments: true }));

            expect(nothingFound).toEqual(without);
            expect(nothingFound.messages.at(-1)!.content).not.toContain(DOCUMENTS_HEADING);
            expect(documentsBlock([])).toBeNull();
        });
    });

    describe('the Story so far reserve', () => {
        const history = (count: number) =>
            Array.from({ length: count }, (_, i) => ({ role: (i % 2 === 0 ? 'assistant' : 'user') as 'user' | 'assistant', text: `M${i} ${'word '.repeat(100)}` }));

        it('makes room for the Documents block when the Story has passages', () => {
            const messages = history(24);
            let differs = 0;
            for (let budget = 3_000; budget <= 8_000; budget += 100) {
                const without = storySoFarCoverage(layers(), messages, budget) ?? 0;
                const withDocuments = storySoFarCoverage({ ...layers(), hasDocuments: true }, messages, budget) ?? 0;
                // Never less covered with the reserve; at some budgets, more.
                expect(withDocuments).toBeGreaterThanOrEqual(without);
                if (withDocuments > without) differs++;
            }
            expect(differs).toBeGreaterThan(5);
        });

        it('reserves nothing for a Story without Documents', () => {
            const messages = history(30);
            expect(storySoFarCoverage({ ...layers(), hasDocuments: false }, messages, 4_000)).toBe(storySoFarCoverage(layers(), messages, 4_000));
        });
    });

    it('logs the floor and the 5 top scores with title and position, marking those sent, and no text', () => {
        const passages = [0.9, 0.8, 0.7, 0.6, 0.5, 0.3].map((score, at) => passage(score, { documentId: at < 3 ? 1 : 2, position: at, text: `SECRET passage text ${at}` }));
        const line = searchLogLine(4, 9, selectPassages(passages, QUERY, MODEL), (id) => (id === 1 ? 'Gull Point light' : 'Tide ledger'));

        expect(line).toBe(
            'Story 4, Chat 9: Document search, floor 0.45; top scores: 0.900 "Gull Point light" #0 (sent), 0.800 "Gull Point light" #1 (sent), 0.700 "Gull Point light" #2 (sent), 0.600 "Tide ledger" #3 (sent), 0.500 "Tide ledger" #4',
        );
        expect(line).not.toContain('SECRET');
    });

    describe('the Suggested replies prompt', () => {
        const lore = [{ id: 1, name: 'Fog bells', keywords: [], text: 'Bells ring in fog.', alwaysOn: true }];

        it("puts the block after the Lore and before the Author's note and the instruction", () => {
            const prompt = buildSuggestionsPrompt({
                ...layers(),
                chosenLore: lore,
                documentPassages: PASSAGES,
                authorsNote: 'Keep it eerie.',
                history: [{ role: 'assistant', text: '@Oren: The lamp is lit.' }],
            });
            const instruction = prompt.messages.at(-1)!.content;

            const documentsPlace = instruction.indexOf(DOCUMENTS_HEADING);
            expect(documentsPlace).toBeGreaterThan(instruction.indexOf(LORE_HEADING));
            expect(instruction.indexOf("# Author's note")).toBeGreaterThan(documentsPlace);
            expect(instruction.indexOf('Step outside the story')).toBeGreaterThan(documentsPlace);
            expect(instruction).toContain('## Gull Point light\nThe keeper trims the wick at dusk.');
        });

        it('takes the block from the history budget: a long history keeps fewer Messages with it, never going over', () => {
            const history = Array.from({ length: 200 }, (_, i) => ({
                role: (i % 2 === 0 ? 'assistant' : 'user') as 'user' | 'assistant',
                text: `M${i} ${'word '.repeat(80)}`,
            }));
            const big = [{ documentTitle: 'Gull Point light', text: 'wick '.repeat(780) }];
            const without = buildSuggestionsPrompt({ ...layers(), history });
            const withDocuments = buildSuggestionsPrompt({ ...layers(), history, documentPassages: big });

            expect(withDocuments.messages.length).toBeLessThan(without.messages.length);
            for (const prompt of [without, withDocuments]) {
                const total = prompt.messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
                expect(total).toBeLessThanOrEqual(TURN_PROMPT_TOKEN_BUDGET);
            }
        });

        it('is exactly as before with no passages', () => {
            const history = [{ role: 'assistant' as const, text: '@Oren: The lamp is lit.' }];
            expect(buildSuggestionsPrompt({ ...layers(), history, documentPassages: [] })).toEqual(buildSuggestionsPrompt({ ...layers(), history }));
        });
    });
});

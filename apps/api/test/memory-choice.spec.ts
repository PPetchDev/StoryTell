import {
    ChoiceMemory,
    chooseMemories,
    lockedOverHalf,
    MEMORY_BUDGET_TOKENS,
    MEMORY_MIN_SIMILARITY,
    memoryCost,
    MemoryChoiceInput,
} from '../src/manager/chat/memory/memory-choice.js';
import { memoryRoomTokens } from '../src/manager/chat/memory/chat-memory-choice.js';
import { storySoFarCoverage } from '../src/manager/chat/story-so-far/story-so-far-prompt.js';
import { PromptLayersInput } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';

/**
 * .scratch/memory-by-meaning/spec.md, "Choosing Memories for a turn": the pure choice of which
 * Memories reach a turn, inside a 4,000-token budget. Hand-made vectors, so each similarity is
 * known exactly: the query is the first axis, and a Memory's score is its first number.
 */

const MODEL = 'test/model';

/** A unit vector scoring `score` against the query (the first axis). */
function scoring(score: number): number[] {
    return [score, Math.sqrt(1 - score * score), 0];
}

let nextId = 1;
function memory(text: string, fields: Partial<ChoiceMemory> = {}): ChoiceMemory {
    return {
        id: nextId++,
        // Padded to one length, so every Memory costs the same and a budget holds a known number of them.
        text: text.padEnd(76, '.'),
        knownBy: ['Oren'],
        locked: false,
        archived: false,
        embedding: null,
        embeddingModel: null,
        ...fields,
    };
}

const near = (score: number): Partial<ChoiceMemory> => ({ embedding: scoring(score), embeddingModel: MODEL });

/** A budget that holds exactly `n` of these Memories. */
const room = (n: number) => n * memoryCost(memory('x'));

function input(overrides: Partial<MemoryChoiceInput>): MemoryChoiceInput {
    return {
        memories: [],
        beliefs: [],
        cast: ['Oren', 'Kai', 'Nara'],
        present: ['Kai'],
        identityName: 'Petch',
        query: { vector: [1, 0, 0], model: MODEL },
        ...overrides,
    };
}

const texts = (choice: ReturnType<typeof chooseMemories>) => choice.memories.map((chosen) => chosen.memory.text.replace(/\.+$/, ''));
const reasons = (choice: ReturnType<typeof chooseMemories>) =>
    choice.memories.map((chosen) => `${chosen.memory.text.replace(/\.+$/, '')}: ${chosen.reason}`);

describe('Choosing Memories for a turn', () => {
    it('has the numbers of the spec: a 4,000-token budget and a 0.35 similarity floor', () => {
        expect(MEMORY_BUDGET_TOKENS).toBe(4_000);
        expect(MEMORY_MIN_SIMILARITY).toBe(0.35);
    });

    it('sends everything that fits when every Memory is locked, close in meaning or about who is present', () => {
        const memories = [memory('Kai fixed the lamp'), memory('Oren found the key', near(0.9)), memory('Kai sang', { locked: true })];
        const choice = chooseMemories(input({ memories }));
        expect(texts(choice)).toEqual(['Kai fixed the lamp', 'Oren found the key', 'Kai sang']);
    });

    it('fills in order: locked, then closest above the floor, then newest about who is present', () => {
        const memories = [
            memory('Oren locked one', { locked: true }),
            memory('Kai old', near(0.1)),
            memory('Oren close', near(0.9)),
            memory('Oren closer', near(0.95)),
            memory('Oren under the floor', near(0.3)),
            memory('Kai newer'),
            memory('Kai newest'),
        ];
        // Room for four: the locked one, the two closest, then the newest about Kai.
        const choice = chooseMemories(input({ memories, budget: room(4) }));
        expect(texts(choice)).toEqual(['Oren locked one', 'Oren close', 'Oren closer', 'Kai newest']);

        // Room for three: the locked one and the two closest; nothing recent is left room for.
        expect(texts(chooseMemories(input({ memories, budget: room(3) })))).toEqual(['Oren locked one', 'Oren close', 'Oren closer']);
        // Room for two: the locked one, then the closest.
        expect(texts(chooseMemories(input({ memories, budget: room(2) })))).toEqual(['Oren locked one', 'Oren closer']);
    });

    it('never sends a Memory only for scoring under the floor, nor one about nobody present', () => {
        const memories = [memory('Oren under the floor', near(MEMORY_MIN_SIMILARITY - 0.01)), memory('Oren at the floor', near(MEMORY_MIN_SIMILARITY))];
        expect(reasons(chooseMemories(input({ memories })))).toEqual(['Oren at the floor: meaning']);
    });

    it('sends every locked Memory, oldest first, even past the budget, and then nothing else', () => {
        const memories = [memory('Oren one', { locked: true }), memory('Oren two', { locked: true }), memory('Kai close', near(0.99)), memory('Oren three', { locked: true })];
        const choice = chooseMemories(input({ memories, budget: room(2) }));
        expect(reasons(choice)).toEqual(['Oren one: locked', 'Oren two: locked', 'Oren three: locked']);
    });

    it('with no query vector, skips the meaning step and fills with the newest about who is present', () => {
        const memories = [memory('Kai one', near(0.99)), memory('Kai two'), memory('Kai three'), memory('Oren far', near(0.99))];
        const choice = chooseMemories(input({ memories, query: null, budget: room(2) }));
        expect(reasons(choice)).toEqual(['Kai two: recent', 'Kai three: recent']);
    });

    it('reads Memories about the worn identity, by {user} or by name, as recent ones too', () => {
        const memories = [memory('{user} owes Oren money'), memory('Petch broke the oar'), memory('Oren mended the net')];
        const choice = chooseMemories(input({ memories, query: null, present: [] }));
        expect(texts(choice)).toEqual(['{user} owes Oren money', 'Petch broke the oar']);
    });

    it('takes a Memory that names nobody as about the Characters who know it', () => {
        const memories = [memory('The lamp is cracked', { knownBy: ['Kai'] }), memory('The bell is cracked', { knownBy: ['Oren'] })];
        expect(texts(chooseMemories(input({ memories, query: null })))).toEqual(['The lamp is cracked']);
    });

    it('finds an archived Memory by meaning, though it never comes in as a recent or a locked one', () => {
        const memories = [
            memory('Kai archived and close', { ...near(0.8), archived: true }),
            memory('Kai archived and far', { ...near(0.1), archived: true }),
            memory('Kai archived and locked', { archived: true, locked: true }),
        ];
        expect(reasons(chooseMemories(input({ memories })))).toEqual(['Kai archived and close: meaning']);
    });

    it('compares only vectors of the query\'s model, and Memories with no vector come in only as recent', () => {
        const memories = [memory('Oren other model', { embedding: scoring(0.99), embeddingModel: 'old/model' }), memory('Oren unembedded'), memory('Oren same model', near(0.6))];
        const choice = chooseMemories(input({ memories }));
        expect(reasons(choice)).toEqual(['Oren same model: meaning']);
    });

    it('writes the chosen in story order, each with its reason and score', () => {
        const memories = [memory('Kai recent', near(0.2)), memory('Oren close', near(0.7)), memory('Oren locked', { locked: true })];
        const choice = chooseMemories(input({ memories }));
        expect(choice.memories.map((chosen) => [chosen.memory.id, chosen.reason, chosen.score])).toEqual([
            [memories[0].id, 'recent', expect.closeTo(0.2, 5)],
            [memories[1].id, 'meaning', expect.closeTo(0.7, 5)],
            [memories[2].id, 'locked', null],
        ]);
    });

    it('fits what it can: a Memory too long for the room left is skipped and smaller ones still come in', () => {
        const long = memory('Oren long and close '.repeat(20), near(0.9));
        const memories = [memory('Kai short'), long, memory('Oren short and close', near(0.8))];
        const choice = chooseMemories(input({ memories, budget: room(2) }));
        expect(texts(choice)).toEqual(['Kai short', 'Oren short and close']);
        expect(choice.usedTokens).toBeLessThanOrEqual(room(2));
    });

    describe('the locked warning', () => {
        it('is on only once the locked Memories alone take more than half the budget', () => {
            const half = Math.floor(MEMORY_BUDGET_TOKENS / 2 / memoryCost(memory('x')));
            const locked = (n: number) => Array.from({ length: n }, (_, at) => memory(`Oren locked ${at}`, { locked: true }));
            expect(lockedOverHalf([...locked(half), memory('Oren unlocked '.repeat(50))])).toBe(false);
            expect(lockedOverHalf(locked(half + 1))).toBe(true);
            // An archived one doesn't count: it is never sent as locked.
            expect(lockedOverHalf([...locked(half), memory('Oren archived', { locked: true, archived: true })])).toBe(false);
        });
    });

    describe('the reserve (spec: "The budget is reserved")', () => {
        it('reserves what could be chosen, up to 4,000 tokens, or the locked ones alone past that', () => {
            expect(memoryRoomTokens([], [])).toBe(0);
            const few = [memory('Oren one'), memory('Oren two', { archived: true })];
            expect(memoryRoomTokens(few, [])).toBe(2 * memoryCost(memory('x')));
            const many = Array.from({ length: 300 }, (_, at) => memory(`Oren ${at}`));
            expect(memoryRoomTokens(many, [])).toBe(MEMORY_BUDGET_TOKENS);
            const locked = Array.from({ length: 300 }, (_, at) => memory(`Oren ${at}`, { locked: true }));
            expect(memoryRoomTokens(locked, [])).toBe(300 * memoryCost(memory('x')));
        });

        it('makes the Story so far trigger count the Memory room the next turn may fill, past the layer as it stands', () => {
            const layers = (memoryRoomTokens?: number): PromptLayersInput => ({
                story: {
                    setting: 'A lighthouse.',
                    pov: Pov.Second,
                    tense: Tense.Present,
                    replyLength: ReplyLength.Medium,
                    characters: [{ name: 'Oren', appearance: 'Old.', personality: 'Gruff.', voice: 'Slow.', exampleLines: [], background: '', secrets: '' }],
                },
                identity: { name: 'Petch', description: 'A traveller.' },
                scene: null,
                bonds: [],
                arcs: [],
                memories: [],
                memoryRoomTokens,
            });
            const messages = Array.from({ length: 20 }, (_, at) => ({ role: 'assistant' as const, text: `M${at} ${'word '.repeat(160)}` }));
            let budget = 5_000;
            while (storySoFarCoverage(layers(), messages, budget) !== null) budget += 1;
            // The smallest budget at which the history fits with no Memory reserve: 4,000 reserved tips it over.
            expect(storySoFarCoverage(layers(0), messages, budget)).toBeNull();
            expect(storySoFarCoverage(layers(MEMORY_BUDGET_TOKENS), messages, budget)).toBeGreaterThan(0);
        });
    });
});

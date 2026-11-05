import { memoryLine } from '../src/manager/chat/memory/memory-prompt.js';
import { buildSuggestionsPrompt } from '../src/manager/chat/suggestions/suggestions-prompt.js';
import { buildTurnPrompt, estimateTokens, PromptMemory, systemPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';

/**
 * Spec: "Memory block", past the cap. Which Memories the Memory layer keeps once it is over
 * its cap: locked ones always, then those about who is in the latest exchange or about the
 * worn identity, then the newest. Pure prompt functions, no database.
 */

function input(overrides: Partial<TurnPromptInput> = {}): TurnPromptInput {
    return {
        story: {
            setting: 'A lighthouse.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [
                { name: 'Mira Vance', appearance: 'Tall.', personality: 'Calm.', voice: 'Dry.', exampleLines: [], background: '', secrets: '' },
                { name: 'Kai', appearance: 'Wiry.', personality: 'Restless.', voice: 'Quick.', exampleLines: [], background: '', secrets: '' },
                { name: 'Oren', appearance: 'Old.', personality: 'Gruff.', voice: 'Slow.', exampleLines: [], background: '', secrets: '' },
            ],
        },
        identity: { name: 'Petch', description: 'A traveller.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
        history: [],
        userText: 'I wait.',
        ...overrides,
    };
}

/** Memories of the same length, so a cap of `n` lines fits exactly `n` of them. */
function memory(text: string, locked = false): PromptMemory {
    return { text: text.padEnd(60, '.'), knownBy: ['Oren'], locked };
}

/** A cap that fits `n` of these Memory lines and not one more. */
function capFor(n: number): number {
    const line = memoryLine(memory('x'));
    return estimateTokens(Array.from({ length: n }, () => line).join('\n'));
}

/** The Memory lines the system prompt kept, in the order it lists them. */
function keptLines(system: string): string[] {
    return system
        .split('\n')
        .filter((line) => line.startsWith('- [known by'))
        .map((line) => line.replace(/^- \[known by [^\]]*\] /, '').replace(/\.+$/, ''));
}

describe('Memory layer past its cap', () => {
    it('changes nothing while the layer is under the cap, whoever is present', () => {
        const memories = [memory('Kai fixed the lamp'), memory('Oren lost a key'), memory('{user} came by boat')];
        const without = systemPrompt(input({ memories, memoryCapTokens: capFor(3) }));
        const withPresent = systemPrompt(input({ memories, memoryCapTokens: capFor(3), present: ['Kai'] }));
        expect(withPresent).toEqual(without);
        expect(without.memoriesLeftOut).toBe(0);
        expect(keptLines(without.text)).toEqual(['Kai fixed the lamp', 'Oren lost a key', 'Petch came by boat']);
    });

    it('with nobody present and nothing about the user, keeps the newest, as before', () => {
        const memories = [memory('Oren one'), memory('Oren two'), memory('Oren three'), memory('Oren four')];
        const system = systemPrompt(input({ memories, memoryCapTokens: capFor(2) }));
        expect(keptLines(system.text)).toEqual(['Oren three', 'Oren four']);
        expect(system.memoriesLeftOut).toBe(2);
    });

    it('keeps an old Memory about a Character in the latest exchange over newer ones about others', () => {
        const memories = [memory('Kai hid the map'), memory('Oren one'), memory('Oren two'), memory('Oren three')];
        const system = systemPrompt(input({ memories, memoryCapTokens: capFor(2), present: ['Kai'] }));
        // Kept in the stable order, not the order of keeping.
        expect(keptLines(system.text)).toEqual(['Kai hid the map', 'Oren three']);
        expect(system.memoriesLeftOut).toBe(2);
    });

    it('reads a Character by first name or full name, as a whole word and in any case', () => {
        const memories = [memory('mira found a shell'), memory('Mira Vance swam'), memory('Miranda sang'), memory('Oren one'), memory('Oren two')];
        const system = systemPrompt(input({ memories, memoryCapTokens: capFor(3), present: ['Mira Vance'] }));
        expect(keptLines(system.text)).toEqual(['mira found a shell', 'Mira Vance swam', 'Oren two']);
    });

    it('keeps Memories about the worn identity, by {user} or by name, over others', () => {
        const memories = [memory('{user} owes Oren money'), memory('Petch broke the oar'), memory('Oren one'), memory('Oren two')];
        const system = systemPrompt(input({ memories, memoryCapTokens: capFor(2) }));
        expect(keptLines(system.text)).toEqual(['Petch owes Oren money', 'Petch broke the oar']);
    });

    it('among Memories about who is present, leaves out the oldest first', () => {
        const memories = [memory('Kai one'), memory('Kai two'), memory('Kai three'), memory('Oren one')];
        const system = systemPrompt(input({ memories, memoryCapTokens: capFor(2), present: ['Kai'] }));
        expect(keptLines(system.text)).toEqual(['Kai two', 'Kai three']);
        expect(system.memoriesLeftOut).toBe(2);
    });

    it('never leaves out a locked Memory, even one about nobody present', () => {
        const memories = [memory('Oren locked', true), memory('Kai one'), memory('Kai two'), memory('Oren new')];
        const system = systemPrompt(input({ memories, memoryCapTokens: capFor(2), present: ['Kai'] }));
        expect(keptLines(system.text)).toEqual(['Oren locked', 'Kai two']);
        expect(system.memoriesLeftOut).toBe(2);
    });

    it('gives the turn prompt and the Suggested replies the same layer', () => {
        const memories = [memory('Kai hid the map'), memory('Oren one'), memory('Oren two'), memory('Oren three')];
        const layers = input({ memories, memoryCapTokens: capFor(2), present: ['Kai'] });
        const turn = buildTurnPrompt(layers);
        const suggestions = buildSuggestionsPrompt({ ...layers, history: [] });
        expect(turn.memoriesLeftOut).toBe(2);
        expect(keptLines(turn.messages[0].content)).toEqual(['Kai hid the map', 'Oren three']);
        expect(suggestions.messages[0].content).toEqual(turn.messages[0].content);
    });
});

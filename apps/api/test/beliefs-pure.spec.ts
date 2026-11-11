import { ApplyExtractionInput, applyExtraction } from '../src/manager/chat/memory/apply-extraction.js';
import { ChoiceMemory, chooseMemories, memoryCost } from '../src/manager/chat/memory/memory-choice.js';
import { buildExtractionPrompt, parseExtraction } from '../src/manager/chat/memory/memory-prompt.js';
import { systemPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';

/**
 * .scratch/memory-by-meaning/spec.md, "Beliefs" (ticket 04), the pure parts: the extraction's
 * rule, its `believe` and `give_up` operations and the drops, the Beliefs in the Memory choice,
 * and the "X believes: …" lines of the Memory layer.
 */

const CAST = [
    { id: 1, name: 'Nara' },
    { id: 2, name: 'Kai' },
    { id: 3, name: 'Oren' },
];

function applyInput(overrides: Partial<ApplyExtractionInput> = {}): ApplyExtractionInput {
    return {
        cast: CAST,
        identityName: 'Petch',
        memories: [{ id: 12, text: '{user} is a Marquis.', knownBy: [2], locked: false, archived: false }],
        beliefs: [
            { id: 5, characterId: 1, text: '{user} is a wandering herder.', active: true },
            { id: 6, characterId: 2, text: 'The well is dry.', active: false },
        ],
        sittingOut: [3],
        ...overrides,
    };
}

const ops = (...operations: object[]) => parseExtraction(JSON.stringify({ operations }));

describe('Beliefs in the extraction', () => {
    describe('the prompt', () => {
        const built = buildExtractionPrompt({
            cast: ['Nara', 'Kai'],
            identityName: 'Petch',
            present: ['Nara'],
            memories: [{ id: 12, text: '{user} is a Marquis.', knownBy: ['Kai'], locked: false }],
            beliefs: [{ id: 5, characterName: 'Nara', text: '{user} is a wandering herder.', contradicts: 12 }],
            userText: 'I tell Nara I herd goats.',
            aiText: '@Nara: A herder, then.',
        });
        const system = built.messages[0].content;
        const user = built.messages[1].content;

        it('carries the rule and the two operations', () => {
            expect(system).toContain(
                'When a Character is told something false, or wrongly concludes something, record it as their Belief. When the story shows them the truth, give the Belief up.',
            );
            expect(system).toContain('{"op":"believe","character":"Name","text":"...","contradicts":12,"cause":"..."}');
            expect(system).toContain('{"op":"give_up","belief":3,"because":"..."}');
        });

        it('lists the active Beliefs, numbered, beside the Memories', () => {
            expect(user).toContain('# Current Memories (id: [known by] text)\n12: - [known by Kai] {user} is a Marquis.');
            expect(user).toContain('# Active Beliefs (id: who believes what)\n5: Nara believes: {user} is a wandering herder. (contradicts Memory 12)');
            expect(user.indexOf('# Active Beliefs')).toBeGreaterThan(user.indexOf('# Current Memories'));
            expect(user.indexOf('# Active Beliefs')).toBeLessThan(user.indexOf('# LATEST EXCHANGE'));
        });

        it('says when there are none', () => {
            const none = buildExtractionPrompt({ cast: ['Nara'], identityName: 'Petch', present: [], memories: [], beliefs: [], userText: null, aiText: 'x' });
            expect(none.messages[1].content).toContain('# Active Beliefs (id: who believes what)\n(none)');
        });
    });

    describe('parsing', () => {
        it('reads believe, with or without contradicts, and give_up', () => {
            expect(
                ops(
                    { op: 'believe', character: 'Nara', text: 'Petch is a herder.', contradicts: 12, cause: 'he said so' },
                    { op: 'believe', character: 'Kai', text: 'The tide turns at noon.', cause: 'guessed' },
                    { op: 'give_up', belief: '5', because: 'she saw the seal' },
                ).operations,
            ).toEqual([
                { op: 'believe', character: 'Nara', text: 'Petch is a herder.', contradicts: 12, cause: 'he said so' },
                { op: 'believe', character: 'Kai', text: 'The tide turns at noon.', contradicts: null, cause: 'guessed' },
                { op: 'give_up', belief: 5, because: 'she saw the seal' },
            ]);
        });

        it('drops a believe with no Character or text and a give_up with no Belief number', () => {
            expect(
                ops(
                    { op: 'believe', text: 'No one holds this.' },
                    { op: 'believe', character: 'Nara' },
                    { op: 'give_up', because: 'nothing' },
                ).operations,
            ).toEqual([]);
        });
    });

    describe('applying', () => {
        it('records a Belief with {user} in place of the name, and gives up an active one', () => {
            const applied = applyExtraction(
                applyInput(),
                ops(
                    { op: 'believe', character: 'kai', text: 'Petch hid the key.', contradicts: 12, cause: 'a lie' },
                    { op: 'give_up', belief: 5, because: 'she saw the seal' },
                ),
            );
            expect(applied.beliefChanges).toEqual([
                { kind: 'add', characterId: 2, text: '{user} hid the key.', contradictsMemoryId: 12, event: 'a lie' },
                { kind: 'give_up', beliefId: 5, event: 'she saw the seal' },
            ]);
            expect(applied.changes).toEqual([]);
            expect(applied.rejected).toEqual([]);
        });

        it('drops a Belief about an unknown or sitting-out Character, and a duplicate of an active Belief', () => {
            const applied = applyExtraction(
                applyInput(),
                ops(
                    { op: 'believe', character: 'Mira', text: 'Anything.', cause: 'x' },
                    { op: 'believe', character: 'Oren', text: 'Anything.', cause: 'x' },
                    { op: 'believe', character: 'Nara', text: '{user} is a  Wandering herder. ', cause: 'x' },
                    { op: 'believe', character: 'Kai', text: 'Petch is a wandering herder.', cause: 'x' },
                    { op: 'believe', character: 'Kai', text: 'Petch is a wandering herder.', cause: 'again' },
                ),
            );
            expect(applied.beliefChanges).toEqual([{ kind: 'add', characterId: 2, text: '{user} is a wandering herder.', contradictsMemoryId: null, event: 'x' }]);
            expect(applied.rejected).toEqual([
                'believe: unknown Character "Mira"',
                'believe: Oren is sitting out',
                'believe: Nara already believes that',
                'believe: Kai already believes that',
            ]);
        });

        it('keeps a Belief whose contradicts names no Memory, without the link', () => {
            const applied = applyExtraction(applyInput(), ops({ op: 'believe', character: 'Kai', text: 'The boat sank.', contradicts: 99, cause: 'x' }));
            expect(applied.beliefChanges).toEqual([{ kind: 'add', characterId: 2, text: 'The boat sank.', contradictsMemoryId: null, event: 'x' }]);
            expect(applied.rejected).toEqual(['believe: no Memory 99 to contradict']);
        });

        it('drops a give-up of a Belief that is not active: unknown, already given up, or given up twice', () => {
            const applied = applyExtraction(
                applyInput(),
                ops(
                    { op: 'give_up', belief: 99, because: 'x' },
                    { op: 'give_up', belief: 6, because: 'x' },
                    { op: 'give_up', belief: 5, because: 'first' },
                    { op: 'give_up', belief: 5, because: 'second' },
                ),
            );
            expect(applied.beliefChanges).toEqual([{ kind: 'give_up', beliefId: 5, event: 'first' }]);
            expect(applied.rejected).toEqual(['give_up 99: not an active Belief', 'give_up 6: not an active Belief', 'give_up 5: not an active Belief']);
        });
    });
});

describe('Beliefs in the Memory choice', () => {
    const memory = (id: number, text: string, locked = false): ChoiceMemory => ({
        id,
        text: text.padEnd(76, '.'),
        knownBy: ['Nara'],
        locked,
        archived: false,
        embedding: null,
        embeddingModel: null,
    });
    const belief = (id: number, characterName: string, text: string) => ({ id, characterName, text });

    it('places the active Beliefs of those present right after the locked Memories, inside the budget', () => {
        const memories = [memory(1, 'Nara locked', true), memory(2, 'Nara recent one'), memory(3, 'Nara recent two')];
        const beliefs = [belief(7, 'Nara', 'Petch is a wandering herder.'), belief(8, 'Kai', 'The well is dry.'), belief(9, 'Nara', 'The ferry runs on Sundays.')];
        const cost = memoryCost(memory(0, 'x'));

        // Room for the locked one, both of Nara's Beliefs, and then one recent Memory.
        const choice = chooseMemories({ memories, beliefs, cast: ['Nara', 'Kai'], present: ['Nara'], identityName: 'Petch', query: null, budget: 2 * cost + 20 });
        expect(choice.beliefs.map((chosen) => [chosen.belief.id, chosen.reason])).toEqual([
            [7, 'believed'],
            [9, 'believed'],
        ]);
        expect(choice.memories.map((chosen) => chosen.memory.id)).toEqual([1]);

        // With more room, the newest Memories about those present come after.
        const roomier = chooseMemories({ memories, beliefs, cast: ['Nara', 'Kai'], present: ['Nara'], identityName: 'Petch', query: null, budget: 3 * cost + 20 });
        expect(roomier.memories.map((chosen) => [chosen.memory.id, chosen.reason])).toEqual([
            [1, 'locked'],
            [3, 'recent'],
        ]);
        expect(roomier.beliefs).toHaveLength(2);
    });

    it("never sends the Belief of a Character who isn't present", () => {
        const choice = chooseMemories({
            memories: [],
            beliefs: [belief(8, 'Kai', 'The well is dry.')],
            cast: ['Nara', 'Kai'],
            present: ['Nara'],
            identityName: 'Petch',
            query: null,
        });
        expect(choice.beliefs).toEqual([]);
    });
});

describe('Beliefs in the Memory layer', () => {
    const input: TurnPromptInput = {
        story: {
            setting: 'A hill camp.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Nara', appearance: 'Tall.', personality: 'Proud.', voice: 'Low.', exampleLines: [], background: '', secrets: '' }],
        },
        identity: { name: 'Petch', description: 'A stranger.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [{ text: '{user} is a Marquis.', knownBy: [], locked: false }],
        beliefs: [{ characterName: 'Nara', text: '{user} is a wandering herder.' }],
        history: [],
        userText: 'I wait.',
    };

    it('tells the Narrator each Belief as "X believes: …", after the Memories, and that a Character acts on it', () => {
        const layer = systemPrompt(input).text.split('# Memory')[1];
        expect(layer).toContain('- [known by no one] Petch is a Marquis.\n- Nara believes: Petch is a wandering herder.\n');
        expect(layer).toContain('A Character acts on what they believe, even when it is wrong.');
    });

    it('lists the Beliefs even with no Memory', () => {
        const layer = systemPrompt({ ...input, memories: [] }).text.split('# Memory')[1];
        expect(layer).toContain('- Nara believes: Petch is a wandering herder.');
        expect(layer).not.toContain('Nothing has been established');
    });
});

import { applyJudgement, ApplyInput } from '../src/manager/chat/judge/apply-judgement.js';
import { BondGate, bondGateInWords, gatesHold, GateBond } from '../src/manager/chat/judge/bond-gates.js';
import { buildJudgePrompt, Judgement, JudgePromptInput } from '../src/manager/chat/judge/judge-prompt.js';
import { buildTurnPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';

// .scratch/bond-axes/issues/04-bond-gates.md: the pure gate check, and how apply and the prompts use it.

const NARA = 1;
const KAI = 2;

const NARA_TO_USER: GateBond = { fromCharacterId: NARA, toCharacterId: null, levels: { trust: 2, affection: 1, desire: -1, tension: 2 } };
const KAI_TO_NARA: GateBond = { fromCharacterId: KAI, toCharacterId: NARA, levels: { trust: -2, affection: 3, desire: 0, tension: 0 } };
const UNMEASURED: GateBond = { fromCharacterId: NARA, toCharacterId: KAI, levels: null };
const BONDS = [NARA_TO_USER, KAI_TO_NARA, UNMEASURED];

const gate = (fromCharacterId: number, toCharacterId: number | null, axis: BondGate['axis'], atLeast: number): BondGate => ({
    fromCharacterId,
    toCharacterId,
    axis,
    atLeast,
});

describe('Bond gate check', () => {
    it.each([
        ['trust', 2, true],
        ['trust', 3, false],
        ['affection', 1, true],
        ['affection', 2, false],
        ['desire', -1, true],
        ['desire', 0, false],
        ['tension', 2, true],
        ['tension', 3, false],
    ] as const)('toward the user: %s at least %i holds: %s', (axis, atLeast, holds) => {
        expect(gatesHold([gate(NARA, null, axis, atLeast)], BONDS)).toEqual([holds]);
    });

    it('toward a Character reads that Bond, not the one toward the user', () => {
        expect(gatesHold([gate(KAI, NARA, 'affection', 3), gate(KAI, NARA, 'trust', -2), gate(KAI, NARA, 'trust', -1)], BONDS)).toEqual([
            true,
            true,
            false,
        ]);
        // Nara's trust toward the user is high, but toward Kai there is no measured Bond.
        expect(gatesHold([gate(NARA, KAI, 'trust', -3)], BONDS)).toEqual([false]);
    });

    it('a Bond with no levels yet does not hold, even at the lowest level', () => {
        expect(gatesHold([gate(NARA, KAI, 'trust', -3), gate(NARA, KAI, 'tension', 0)], BONDS)).toEqual([false, false]);
    });

    it('a Bond that has not formed does not hold', () => {
        expect(gatesHold([gate(KAI, null, 'tension', 0)], BONDS)).toEqual([false]);
    });

    it('says a gate in words, never in numbers', () => {
        expect(bondGateInWords('Nara', 'you', 'trust', 2)).toBe('Nara toward you, Trust at least trusts');
        expect(bondGateInWords('Kai', 'Nara', 'tension', 1)).toBe('Kai toward Nara, Tension at least uneasy');
    });
});

const NO_JUDGED_CHANGE: Judgement = { bondChanges: [], arcSteps: [], scenes: [{ moveOn: false, reason: 'Not yet.' }], timeOfDay: null, expressions: [] };

function applyInput(overrides: Partial<ApplyInput> = {}): ApplyInput {
    return {
        cast: [
            { id: NARA, name: 'Nara' },
            { id: KAI, name: 'Kai' },
        ],
        identityName: 'Ash',
        bonds: [{ fromCharacterId: NARA, toCharacterId: null, label: 'Wary', description: 'Unsure of Ash.', levels: { trust: 1, affection: 0, desire: 0, tension: 0 } }],
        scenes: [
            { id: 10, name: 'Arrival', moveOnCondition: '', gates: [gate(NARA, null, 'trust', 2)] },
            { id: 11, name: 'The lamp', moveOnCondition: '', gates: [] },
        ],
        currentSceneId: 10,
        ...overrides,
    };
}

const raisesTrust: Judgement = {
    ...NO_JUDGED_CHANGE,
    bondChanges: [{ from: 'Nara', to: 'user', label: 'Trusting', description: 'She lets Ash in.', cause: 'Ash kept the secret.', levels: { trust: 2 } }],
};

describe('Applying a judgement: Bond gates', () => {
    it('a gates-only Scene moves on when this turn\'s change opens its gate, without the Judge\'s move_on, naming the gate', () => {
        const applied = applyJudgement(applyInput(), raisesTrust);
        expect(applied.scene).toEqual({
            fromSceneId: 10,
            fromSceneName: 'Arrival',
            toSceneId: 11,
            toSceneName: 'The lamp',
            event: 'Nara toward Ash, Trust at least trusts',
        });
    });

    it('a gates-only Scene stays while a gate does not hold, whatever the Judge says', () => {
        const saysMoveOn: Judgement = { ...NO_JUDGED_CHANGE, scenes: [{ moveOn: true, reason: 'It happened.' }] };
        expect(applyJudgement(applyInput(), saysMoveOn).scene).toBeNull();
    });

    it('a gate already held before the turn moves a gates-only Scene on at once', () => {
        const input = applyInput({
            bonds: [{ fromCharacterId: NARA, toCharacterId: null, label: 'Trusting', description: '', levels: { trust: 3, affection: 0, desire: 0, tension: 0 } }],
        });
        expect(applyJudgement(input, NO_JUDGED_CHANGE).scene).toMatchObject({ toSceneId: 11 });
    });

    it('a Scene with a condition and gates needs both: the Judge\'s move_on and every gate', () => {
        const scenes = [
            { id: 10, name: 'Arrival', moveOnCondition: 'Nara opens the door.', gates: [gate(NARA, null, 'trust', 2)] },
            { id: 11, name: 'The lamp', moveOnCondition: '', gates: [] },
        ];
        const moveOn = { moveOn: true, reason: 'Nara opened the door.' };
        // The event without the feeling.
        expect(applyJudgement(applyInput({ scenes }), { ...NO_JUDGED_CHANGE, scenes: [moveOn] }).scene).toBeNull();
        // The feeling without the event.
        expect(applyJudgement(applyInput({ scenes }), raisesTrust).scene).toBeNull();
        // Both, in the same turn: the Judge's reason is the event.
        expect(applyJudgement(applyInput({ scenes }), { ...raisesTrust, scenes: [moveOn] }).scene).toMatchObject({
            toSceneId: 11,
            event: 'Nara opened the door.',
        });
    });

    it('a gate on an unmeasured Bond holds the Scene back', () => {
        const input = applyInput({
            bonds: [{ fromCharacterId: NARA, toCharacterId: null, label: 'Wary', description: '', levels: null }],
            scenes: [
                { id: 10, name: 'Arrival', moveOnCondition: '', gates: [gate(NARA, null, 'tension', 0)] },
                { id: 11, name: 'The lamp', moveOnCondition: '', gates: [] },
            ],
        });
        const stillUnmeasured: Judgement = {
            ...NO_JUDGED_CHANGE,
            bondChanges: [{ from: 'Nara', to: 'user', label: 'Curious', description: 'Less wary.', cause: 'A kind word.', levels: null }],
        };
        expect(applyJudgement(input, stillUnmeasured).scene).toBeNull();
    });

    it('a Scene with neither gates nor a condition moves on as before, on the Judge\'s word', () => {
        const scenes = [{ id: 10, name: 'Arrival', moveOnCondition: '', gates: [] }];
        expect(applyJudgement(applyInput({ scenes }), { ...NO_JUDGED_CHANGE, scenes: [{ moveOn: true, reason: 'Done.' }] }).scene).toMatchObject({
            toSceneId: null,
            event: 'Done.',
        });
    });
});

describe('Prompts: Bond gates', () => {
    const judgeInput: JudgePromptInput = {
        cast: [{ name: 'Nara', personality: 'Guarded.', arcDirection: '' }],
        identityName: 'Ash',
        bonds: [],
        arcs: [],
        scene: { name: 'Arrival', moveOnCondition: '' },
        recent: [],
        userText: 'I knock.',
        aiText: '@Nara: Late.',
    };

    it('the Judge sees "(gates only)" for a Scene that moves on by its gates alone', () => {
        const user = buildJudgePrompt({ ...judgeInput, scene: { name: 'Arrival', moveOnCondition: '', gatesOnly: true } }).messages[1].content;
        expect(user).toContain('# Current Scene\nArrival. Move-on condition: (gates only)\n');
        // Without gates the line is as it was.
        expect(buildJudgePrompt(judgeInput).messages[1].content).toContain('# Current Scene\nArrival. Move-on condition: (none)\n');
    });

    function turnInput(scene: TurnPromptInput['scene']): TurnPromptInput {
        return {
            story: {
                setting: 'A lighthouse.',
                pov: Pov.First,
                tense: Tense.Present,
                replyLength: ReplyLength.Medium,
                characters: [{ name: 'Nara', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.', exampleLines: [], background: '', secrets: '' }],
            },
            identity: { name: 'Ash', description: 'The new keeper.' },
            scene,
            bonds: [],
            arcs: [],
            memories: [],
            history: [{ role: 'assistant', text: '@Nara: Late.' }],
            userText: 'I knock.',
        };
    }

    const system = (input: TurnPromptInput) => buildTurnPrompt(input).messages[0].content;

    it('the Narrator\'s Scene line names the gates in words, beside the condition or alone', () => {
        const withBoth = system(turnInput({ name: 'Arrival', situation: 'Reach the lamp.', moveOnCondition: 'Nara opens the door.', gates: ['Nara toward Ash, Trust at least trusts'] }));
        expect(withBoth).toContain('This Scene moves on once: Nara opens the door.');
        expect(withBoth).toContain('It also waits for these feelings, which must grow on their own: Nara toward Ash, Trust at least trusts.');

        const gatesOnly = system(turnInput({ name: 'Arrival', situation: 'Reach the lamp.', moveOnCondition: '', gates: ['Nara toward Ash, Trust at least trusts'] }));
        expect(gatesOnly).toContain('This Scene moves on once these feelings have grown: Nara toward Ash, Trust at least trusts.');
        expect(gatesOnly).not.toMatch(/at least -?\d/);
    });

    it('a Scene without gates sends the Narrator the Scene line it sent before', () => {
        const scene = { name: 'Arrival', situation: 'Reach the lamp.', moveOnCondition: 'Nara opens the door.' };
        expect(system(turnInput({ ...scene, gates: [] }))).toBe(system(turnInput(scene)));
    });
});

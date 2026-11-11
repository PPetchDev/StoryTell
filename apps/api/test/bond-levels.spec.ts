import { applyJudgement, ApplyBond, ApplyInput } from '../src/manager/chat/judge/apply-judgement.js';
import { buildJudgePrompt, JudgedBondChange, Judgement, JudgePromptInput, parseJudgement } from '../src/manager/chat/judge/judge-prompt.js';
import { buildTurnPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { BondLevels, bondLevelsInWords, bondLevelWord } from '../src/model/ledger/bond-axes.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';

// .scratch/bond-axes/issues/01-bond-levels-from-the-judge.md: the pure prompt, parse and apply rules.

const LEVELS: BondLevels = { trust: -1, affection: 1, desire: 1, tension: 1 };

describe('Bond axes: the words', () => {
    it('names every level of every axis in words, from the spec table', () => {
        expect([-3, -2, -1, 0, 1, 2, 3].map((level) => bondLevelWord('trust', level))).toEqual([
            'betrayed', 'suspicious', 'wary', 'unsure', 'inclined to trust', 'trusts', 'trusts completely',
        ]);
        expect([-3, -2, -1, 0, 1, 2, 3].map((level) => bondLevelWord('affection', level))).toEqual([
            'hates', 'dislikes', 'cool', 'indifferent', 'fond', 'close', 'devoted',
        ]);
        expect([-3, -2, -1, 0, 1, 2, 3].map((level) => bondLevelWord('desire', level))).toEqual([
            'repelled', 'put off', 'uninterested', 'no pull', 'drawn', 'wants', 'aches for',
        ]);
        expect([0, 1, 2, 3].map((level) => bondLevelWord('tension', level))).toEqual(['at ease', 'uneasy', 'strained', 'at breaking point']);
    });

    it('states four levels in one line of words', () => {
        expect(bondLevelsInWords(LEVELS)).toBe('Trust: wary · Affection: fond · Desire: drawn · Tension: uneasy');
    });
});

function judgeInput(overrides: Partial<JudgePromptInput> = {}): JudgePromptInput {
    return {
        cast: [
            { name: 'Mira', personality: 'Guarded.', arcDirection: '' },
            { name: 'Kai', personality: 'Nosy.', arcDirection: '' },
        ],
        identityName: 'Ash',
        bonds: [
            { fromName: 'Mira', toName: null, label: 'Wary', description: 'She expects Ash to leave.', levels: LEVELS },
            { fromName: 'Kai', toName: 'Mira', label: 'Fond', description: 'An old friend.', levels: null },
        ],
        arcs: [],
        scene: null,
        recent: [],
        userText: 'I knock.',
        aiText: '@Mira: Late.',
        ...overrides,
    };
}

describe('Judge prompt: Bond levels', () => {
    it('shows each current Bond with its levels in words, or "levels not set yet"', () => {
        const user = buildJudgePrompt(judgeInput()).messages[1].content;
        expect(user).toContain(
            '# Current Bonds\n' +
                '- Mira → user: "Wary" — She expects Ash to leave. (Trust: wary · Affection: fond · Desire: drawn · Tension: uneasy)\n' +
                '- Kai → Mira: "Fond" — An old friend. (levels not set yet)\n',
        );
    });

    it('a Bond whose levels are left out reads as not set yet', () => {
        const user = buildJudgePrompt(
            judgeInput({ bonds: [{ fromName: 'Mira', toName: null, label: 'Wary', description: 'She expects Ash to leave.' }] }),
        ).messages[1].content;
        expect(user).toContain('- Mira → user: "Wary" — She expects Ash to leave. (levels not set yet)\n');
    });

    it('gives the axis meanings, the step limits, the first measure and the levels field', () => {
        const system = buildJudgePrompt(judgeInput()).messages[0].content;
        expect(system).toContain(
            'Trust: -3 betrayed, -2 suspicious, -1 wary, 0 unsure, 1 inclined to trust, 2 trusts, 3 trusts completely',
        );
        expect(system).toContain('Affection: -3 hates, -2 dislikes, -1 cool, 0 indifferent, 1 fond, 2 close, 3 devoted');
        expect(system).toContain('Desire: -3 repelled, -2 put off, -1 uninterested, 0 no pull, 1 drawn, 2 wants, 3 aches for');
        expect(system).toContain('Tension: 0 at ease, 1 uneasy, 2 strained, 3 at breaking point');
        expect(system).toContain('Each axis moves at most ONE step per turn; Tension may rise two steps but falls only one.');
        expect(system).toContain('A change may move levels and keep the same label.');
        expect(system).toContain('When a Bond shows "levels not set yet", give a change for it setting all four levels');
        expect(system).toContain(
            '{"bond_changes":[{"from":"Name","to":"user|Name","label":"...","description":"...","levels":{"trust":0,"affection":0,"desire":0,"tension":0},"cause":"..."}],',
        );
    });
});

describe('Judge parse: levels, read loosely', () => {
    const parse = (item: Record<string, unknown>): JudgedBondChange =>
        parseJudgement(JSON.stringify({ bond_changes: [{ from: 'Mira', to: 'user', label: 'Wary', ...item }] })).bondChanges[0];

    it('reads each axis that is a whole number in range', () => {
        expect(parse({ levels: { trust: -3, affection: 3, desire: 0, tension: 2 } }).levels).toEqual({
            trust: -3,
            affection: 3,
            desire: 0,
            tension: 2,
        });
    });

    it('ignores a level that is not a whole number in range, and an unknown axis', () => {
        expect(parse({ levels: { trust: '2', affection: 1.5, desire: 4, tension: -1, joy: 1 } }).levels).toEqual({});
        expect(parse({ levels: { trust: 1, tension: 3, desire: null } }).levels).toEqual({ trust: 1, tension: 3 });
    });

    it('reads no levels when they are missing or not an object', () => {
        expect(parse({}).levels).toBeNull();
        expect(parse({ levels: null }).levels).toBeNull();
        expect(parse({ levels: [1, 2, 3, 4] }).levels).toBeNull();
        expect(parse({ levels: 'trusts' }).levels).toBeNull();
    });
});

function applyInput(bonds: ApplyBond[]): ApplyInput {
    return {
        cast: [
            { id: 1, name: 'Mira' },
            { id: 2, name: 'Kai' },
        ],
        identityName: 'Ash',
        bonds,
        scenes: [],
        currentSceneId: null,
    };
}

const miraTowardUser = (levels: BondLevels | null, label = 'Wary'): ApplyBond => ({
    fromCharacterId: 1,
    toCharacterId: null,
    label,
    description: 'She expects Ash to leave.',
    levels,
});

function judged(change: Partial<JudgedBondChange>): Judgement {
    return {
        bondChanges: [{ from: 'Mira', to: 'user', label: 'Curious', description: 'The letter.', cause: 'A letter.', levels: null, ...change }],
        arcSteps: [],
        scenes: [],
        timeOfDay: null,
        expressions: [],
    };
}

describe('Judge apply: the step limits', () => {
    const MIDDLE: BondLevels = { trust: 0, affection: 0, desire: 0, tension: 1 };

    it('lets each axis move one step, and clamps a larger move to one step, logging it', () => {
        const applied = applyJudgement(
            applyInput([miraTowardUser(MIDDLE)]),
            judged({ levels: { trust: 3, affection: -2, desire: 1, tension: 1 } }),
        );
        expect(applied.bonds).toHaveLength(1);
        expect(applied.bonds[0].levels).toEqual({ trust: 1, affection: -1, desire: 1, tension: 1 });
        expect(applied.rejected).toEqual([
            'Bond 1->user: Trust 0 → 3 clamped to 1',
            'Bond 1->user: Affection 0 → -2 clamped to -1',
        ]);
    });

    it('lets Tension rise two steps, but no more, and fall only one', () => {
        const rise = (to: number) =>
            applyJudgement(applyInput([miraTowardUser(MIDDLE)]), judged({ levels: { tension: to } })).bonds[0].levels?.tension;
        expect(rise(3)).toBe(3);
        expect(applyJudgement(applyInput([miraTowardUser({ ...MIDDLE, tension: 0 })]), judged({ levels: { tension: 3 } })).bonds[0].levels?.tension).toBe(2);
        expect(applyJudgement(applyInput([miraTowardUser({ ...MIDDLE, tension: 3 })]), judged({ levels: { tension: 1 } })).bonds[0].levels?.tension).toBe(2);
        expect(applyJudgement(applyInput([miraTowardUser({ ...MIDDLE, tension: 3 })]), judged({ levels: { tension: 2 } })).bonds[0].levels?.tension).toBe(2);
    });

    it("clamps a level to its axis's range", () => {
        const applied = applyJudgement(
            applyInput([miraTowardUser({ trust: 3, affection: -3, desire: 0, tension: 3 })]),
            judged({ levels: { trust: 4, affection: -4, tension: 5 } }),
        );
        expect(applied.bonds[0].levels).toEqual({ trust: 3, affection: -3, desire: 0, tension: 3 });
    });

    it('keeps the axes a change leaves out, and keeps every level when it leaves out `levels`', () => {
        const partial = applyJudgement(applyInput([miraTowardUser(LEVELS)]), judged({ levels: { trust: 0 } }));
        expect(partial.bonds[0].levels).toEqual({ ...LEVELS, trust: 0 });
        const none = applyJudgement(applyInput([miraTowardUser(LEVELS)]), judged({ levels: null }));
        expect(none.bonds[0]).toMatchObject({ label: 'Curious', levels: LEVELS });
    });
});

describe('Judge apply: the first measure', () => {
    it('takes the levels as they are, unclamped, for a Bond with no levels yet', () => {
        const levels: BondLevels = { trust: -3, affection: 3, desire: 2, tension: 3 };
        const applied = applyJudgement(applyInput([miraTowardUser(null)]), judged({ label: 'Wary', levels }));
        expect(applied.bonds).toEqual([
            {
                fromCharacterId: 1,
                toCharacterId: null,
                label: 'Wary',
                description: 'The letter.',
                levels,
                before: { label: 'Wary', description: 'She expects Ash to leave.' },
                event: 'A letter.',
            },
        ]);
        expect(applied.rejected).toEqual([]);
    });

    it('takes them for a new pair too, within range, the middle for an axis left out', () => {
        const applied = applyJudgement(
            applyInput([]),
            judged({ from: 'Kai', to: 'Mira', label: 'Fond', levels: { trust: 2, affection: 9, tension: 2 } }),
        );
        expect(applied.bonds[0]).toMatchObject({ fromCharacterId: 2, toCharacterId: 1, before: null, levels: { trust: 2, affection: 3, desire: 0, tension: 2 } });
    });

    it('leaves a Bond with no levels unmeasured when the change gives none', () => {
        const applied = applyJudgement(applyInput([miraTowardUser(null)]), judged({ label: 'Curious', levels: null }));
        expect(applied.bonds[0]).toMatchObject({ label: 'Curious', levels: null });
    });
});

describe('Judge apply: what counts as a change', () => {
    it('keeps a change with the same label and new levels, under the label it had', () => {
        const applied = applyJudgement(
            applyInput([miraTowardUser(LEVELS)]),
            judged({ label: 'wary', description: 'She lets Ash stay.', levels: { trust: 0 } }),
        );
        expect(applied.bonds).toEqual([
            {
                fromCharacterId: 1,
                toCharacterId: null,
                label: 'Wary',
                description: 'She lets Ash stay.',
                levels: { ...LEVELS, trust: 0 },
                before: { label: 'Wary', description: 'She expects Ash to leave.' },
                event: 'A letter.',
            },
        ]);
    });

    it('keeps the description it had when a same-label change gives none', () => {
        const applied = applyJudgement(applyInput([miraTowardUser(null)]), judged({ label: 'Wary', description: '', levels: LEVELS }));
        expect(applied.bonds[0]).toMatchObject({ label: 'Wary', description: 'She expects Ash to leave.', levels: LEVELS });
    });

    it('drops a change when neither the label nor any level differs', () => {
        for (const [current, levels] of [
            [LEVELS, LEVELS],
            [LEVELS, null],
            [LEVELS, { affection: 1 }],
            [null, null],
            [null, {}],
        ] as Array<[BondLevels | null, JudgedBondChange['levels']]>) {
            const applied = applyJudgement(applyInput([miraTowardUser(current)]), judged({ label: 'WARY', levels }));
            expect(applied.bonds).toEqual([]);
            expect(applied.rejected).toEqual(['Bond 1->user: same label "WARY" and levels — not a change']);
        }
    });

    it('drops a change whose only move was clamped away', () => {
        const applied = applyJudgement(
            applyInput([miraTowardUser({ trust: 3, affection: 0, desire: 0, tension: 0 })]),
            judged({ label: 'Wary', levels: { trust: 5 } }),
        );
        expect(applied.bonds).toEqual([]);
    });
});

function turnInput(overrides: Partial<TurnPromptInput> = {}): TurnPromptInput {
    return {
        story: {
            setting: 'A lighthouse.',
            pov: Pov.First,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [
                { name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.', exampleLines: [], background: '', secrets: '' },
                { name: 'Kai', appearance: 'Wiry.', personality: 'Nosy.', voice: 'Rambling.', exampleLines: [], background: '', secrets: '' },
            ],
        },
        identity: { name: 'Ash', description: 'The new keeper.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
        history: [{ role: 'assistant', text: '@Mira: Late.' }],
        userText: 'I knock.',
        ...overrides,
    };
}

describe('The feelings layer: Bond levels in words', () => {
    it('adds the levels in words where a Bond has them, and nothing where it has none', () => {
        const system = buildTurnPrompt(
            turnInput({
                bonds: [
                    { fromName: 'Mira', toName: null, label: 'Wary', description: 'She expects Ash to leave.', levels: LEVELS },
                    { fromName: 'Kai', toName: 'Mira', label: 'Fond', description: 'An old friend.', levels: null },
                ],
            }),
        ).messages[0].content;
        expect(system).toContain(
            '# Feelings (hidden from the user; show them only through behaviour)\n' +
                '- Mira → the user (Ash): "Wary" — She expects Ash to leave. (Trust: wary · Affection: fond · Desire: drawn · Tension: uneasy)\n' +
                '- Kai → Mira: "Fond" — An old friend.\n' +
                'Each Character knows only its OWN feelings.',
        );
    });

    it('is exactly as before when no Bond has levels', () => {
        const bond = { fromName: 'Mira', toName: null, label: 'Wary', description: 'She expects Ash to leave.' };
        expect(buildTurnPrompt(turnInput({ bonds: [{ ...bond, levels: null }] })).messages).toEqual(
            buildTurnPrompt(turnInput({ bonds: [bond] })).messages,
        );
        expect(buildTurnPrompt(turnInput({ bonds: [bond] })).messages[0].content).toContain(
            '- Mira → the user (Ash): "Wary" — She expects Ash to leave.\nEach Character knows only its OWN feelings.',
        );
    });
});

import { LINGERING_REPLIES, PASSED_BY_REPLIES, repliesInScene, CountedMessage } from '../src/manager/chat/scene-replies.js';
import { applyJudgement, ApplyInput } from '../src/manager/chat/judge/apply-judgement.js';
import { buildJudgePrompt, Judgement, JudgePromptInput, parseJudgement } from '../src/manager/chat/judge/judge-prompt.js';
import { buildTurnPrompt, PromptScene, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';

// .scratch/scene-flow/spec.md: Scenes that keep moving. The pure parts: the reply count and the prompt lines.

const OPENING: CountedMessage = { id: 1, kind: 'ai', model: 'author' };
const user = (id: number): CountedMessage => ({ id, kind: 'user', model: null });
const reply = (id: number): CountedMessage => ({ id, kind: 'ai', model: 'fake/text-model' });

/** The Opening, then `count` exchanges: User Message 2, reply 3, User Message 4, reply 5, … */
function played(count: number): CountedMessage[] {
    const messages = [OPENING];
    for (let i = 0; i < count; i++) messages.push(user(2 + 2 * i), reply(3 + 2 * i));
    return messages;
}

describe('Replies in the Scene', () => {
    it('counts every reply since the Opening while the Chat has never moved on', () => {
        expect(repliesInScene({ currentSceneId: 10, messages: played(3), sceneAdvances: [] })).toBe(3);
        // A Continue reply with no User Message before it counts too.
        expect(repliesInScene({ currentSceneId: 10, messages: [...played(2), reply(99)], sceneAdvances: [] })).toBe(3);
    });

    it('never counts the Opening, whether its model reads "author" or none', () => {
        expect(repliesInScene({ currentSceneId: 10, messages: [OPENING], sceneAdvances: [] })).toBe(0);
        expect(repliesInScene({ currentSceneId: 10, messages: [{ id: 1, kind: 'ai', model: null }, user(2)], sceneAdvances: [] })).toBe(0);
        expect(repliesInScene({ currentSceneId: 10, messages: [], sceneAdvances: [] })).toBe(0);
    });

    it('counts only the replies after the Message of the latest Scene advance', () => {
        // Replies 3, 5, 7, 9; the Scene moved on with reply 5.
        expect(repliesInScene({ currentSceneId: 11, messages: played(4), sceneAdvances: [{ messageId: 5 }] })).toBe(2);
        // Two advances: the later one counts.
        expect(repliesInScene({ currentSceneId: 12, messages: played(4), sceneAdvances: [{ messageId: 3 }, { messageId: 7 }] })).toBe(1);
        // Moved on with the newest reply: the new Scene has none yet.
        expect(repliesInScene({ currentSceneId: 12, messages: played(4), sceneAdvances: [{ messageId: 9 }] })).toBe(0);
    });

    it('reads only the Messages it is given: an advance caused by a later Message does not count', () => {
        // The Judge counts up to the reply it judges, so an advance of a later reply is not in view.
        expect(repliesInScene({ currentSceneId: 10, messages: played(2), sceneAdvances: [{ messageId: 7 }] })).toBe(2);
    });

    it('has no count in free play', () => {
        expect(repliesInScene({ currentSceneId: null, messages: played(30), sceneAdvances: [{ messageId: 3 }] })).toBeNull();
        expect(repliesInScene({ currentSceneId: null, messages: played(30), sceneAdvances: [] })).toBeNull();
    });

    it('sets the lingering threshold at 8', () => {
        expect(LINGERING_REPLIES).toBe(8);
    });
});

function turnInput(scene: TurnPromptInput['scene']): TurnPromptInput {
    return {
        story: {
            setting: 'A camp of herders on the steppe.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Nara', appearance: 'Tall.', personality: 'Warm and teasing.', voice: 'Quick.', exampleLines: [], background: '', secrets: '' }],
        },
        identity: { name: 'Ash', description: 'A trader passing through.' },
        scene,
        bonds: [],
        arcs: [],
        memories: [],
        history: [{ role: 'assistant', text: '@Nara: Drink.' }],
        userText: 'I taste the milk.',
    };
}

/** The Narrator's Scene layer alone, from its heading to the next layer's. */
function sceneLayerOf(input: TurnPromptInput): string {
    const system = buildTurnPrompt(input).messages[0].content;
    const start = system.indexOf('# Current Scene');
    const end = system.indexOf('\n\n# ', start + 1);
    return system.slice(start, end);
}

const MILK: PromptScene = {
    name: 'Mare\'s milk',
    situation: 'Ash is a guest at the fire.',
    moveOnCondition: 'Ash tastes the milk and openly asks where the tribe keeps its cows.',
};
const GATES = ['Nara toward Ash, Trust at least trusts'];

describe('The Narrator\'s Scene line', () => {
    it('under the lingering threshold, is the line it always was', () => {
        const calm = sceneLayerOf(turnInput({ ...MILK, replies: LINGERING_REPLIES - 1 }));
        expect(calm).toBe(sceneLayerOf(turnInput(MILK)));
        expect(calm).toBe(sceneLayerOf(turnInput({ ...MILK, replies: 0 })));
        expect(calm).toContain('Let that happen naturally; never force it. Don\'t hurry toward it');
        expect(calm).not.toContain('gone on a while');
    });

    it('from the lingering threshold, asks the Characters to open the way toward the condition in character, without writing the user\'s part', () => {
        const lingering = sceneLayerOf(turnInput({ ...MILK, replies: LINGERING_REPLIES }));
        expect(lingering).toContain('This Scene moves on once: Ash tastes the milk and openly asks where the tribe keeps its cows.');
        expect(lingering).toContain('This Scene has gone on a while.');
        expect(lingering).toContain('the Characters, in character, now open the way toward it');
        expect(lingering).toContain('bring up its subject, offer a reason or a chance, or move the scene toward where it can happen');
        expect(lingering).toContain('a little each reply, without abandoning what is happening now');
        expect(lingering).toContain('Never write Ash\'s part of it: what Ash must do or say stays Ash\'s to do.');
        expect(lingering).not.toContain('Don\'t hurry toward it');
        // Well past the threshold it is the same line.
        expect(sceneLayerOf(turnInput({ ...MILK, replies: 43 }))).toBe(lingering);
    });

    it('lingering with gates, also asks for moments that let those feelings grow', () => {
        const lingering = sceneLayerOf(turnInput({ ...MILK, gates: GATES, replies: LINGERING_REPLIES }));
        expect(lingering).toContain('the Characters, in character, now open the way toward it');
        expect(lingering).toContain('It also waits for these feelings: Nara toward Ash, Trust at least trusts. Give the Characters moments that let those feelings grow.');
        // Under the threshold the gates line is as it was.
        expect(sceneLayerOf(turnInput({ ...MILK, gates: GATES, replies: LINGERING_REPLIES - 1 }))).toContain(
            'It also waits for these feelings, which must grow on their own: Nara toward Ash, Trust at least trusts.',
        );
    });

    it('lingering gates-only, gets only the gates part', () => {
        const gatesOnly = { ...MILK, moveOnCondition: '', gates: GATES };
        const lingering = sceneLayerOf(turnInput({ ...gatesOnly, replies: LINGERING_REPLIES }));
        expect(lingering).toContain('This Scene moves on once these feelings have grown: Nara toward Ash, Trust at least trusts.');
        expect(lingering).toContain('This Scene has gone on a while.');
        expect(lingering).toContain('Give the Characters moments, in character, that let those feelings grow, a little each reply, without abandoning what is happening now.');
        expect(lingering).not.toContain('open the way toward it');
        expect(lingering).not.toContain('Never write Ash\'s part');
        // Under the threshold, as it was.
        expect(sceneLayerOf(turnInput({ ...gatesOnly, replies: LINGERING_REPLIES - 1 }))).toBe(sceneLayerOf(turnInput(gatesOnly)));
    });

    it('lingering, never contains a digit', () => {
        for (const scene of [
            { ...MILK, replies: LINGERING_REPLIES },
            { ...MILK, gates: GATES, replies: 43 },
            { ...MILK, moveOnCondition: '', gates: GATES, replies: 20 },
        ]) {
            expect(sceneLayerOf(turnInput(scene))).not.toMatch(/\d/);
        }
    });

    it('in free play, says the story unfolds freely', () => {
        expect(sceneLayerOf(turnInput(null))).toBe('# Current Scene\nNo Scene — the story unfolds freely.');
    });
});

const JUDGE_INPUT: JudgePromptInput = {
    cast: [{ name: 'Nara', personality: 'Warm and teasing.', arcDirection: '' }],
    identityName: 'Ash',
    bonds: [],
    arcs: [{ name: 'Nara', steps: [] }],
    scene: { name: 'Mare\'s milk', moveOnCondition: 'Ash tastes the milk and openly asks where the tribe keeps its cows.' },
    recent: ['Ash: I taste the milk.', '@Nara: Good?'],
    userText: 'Where do your people graze the herd?',
    aiText: '@Nara: Past the river.',
};

// .scratch/scene-flow/issues/02-judge-reads-substance.md
describe('The Judge\'s Scene rule reads a condition for its substance', () => {
    const system = buildJudgePrompt(JUDGE_INPUT).messages[0].content;
    const rule = system.slice(system.indexOf('Scene rule:'), system.indexOf('Time of day rule:'));

    it('counts what the condition describes once it has happened in substance, in any words or order', () => {
        expect(rule).toContain('with the Bonds and the story so far in view');
        expect(rule).toContain('Be strict about whether it happened, not about its wording');
        expect(rule).toContain('met means it has fully HAPPENED in the story by the end of the latest exchange, in substance, in any words or order');
    });

    it('counts a part met in an earlier exchange', () => {
        expect(rule).toContain('A part of the condition that happened in an earlier exchange still counts');
    });

    it('keeps the rules about getting closer, who must act, every part, and doubt', () => {
        expect(rule).toContain('Not met: getting closer, someone about to do it, saying they could or will do it, agreeing to do it later, or the story setting it up.');
        expect(rule).toContain('When the condition names who must act (the user or a Character), only that one doing it counts.');
        expect(rule).toContain('When the condition has several parts, every part must have happened.');
        expect(rule).toContain('When in doubt, move_on is false.');
        expect(rule).toContain('Write the reason first, saying what has and has not happened yet, then decide move_on from it.');
    });

    // "With the Bonds and the story so far in view": the Judge sees only the last few Messages, so a
    // part met long ago reaches it only through the Chat's Story so far.
    it('shows the Story so far before the recent story when the Chat has one, and nothing when it has none', () => {
        const withSummary = buildJudgePrompt({ ...JUDGE_INPUT, storySoFar: 'Ash tasted the milk at the stall on the first day.' }).messages[1].content;
        expect(withSummary).toContain('# Story so far (earlier events, summarised)\nAsh tasted the milk at the stall on the first day.\n\n# Recent story (context)');
        const without = buildJudgePrompt({ ...JUDGE_INPUT, storySoFar: null }).messages[1].content;
        expect(without).not.toContain('# Story so far');
        expect(buildJudgePrompt(JUDGE_INPUT).messages[1].content).not.toContain('# Story so far');
    });

    it('no longer says a Scene is meant to last many exchanges', () => {
        expect(system).not.toContain('A Scene is meant to last many exchanges');
        expect(system).not.toContain('meant to last');
    });
});

// .scratch/scene-flow/issues/03-passed-by-scenes.md
describe('The Judge prompt\'s passed-by rule', () => {
    const currentScene = (input: JudgePromptInput): string => {
        const user = buildJudgePrompt(input).messages[1].content;
        return user.slice(user.indexOf('# Current Scene'), user.indexOf('# Time of day'));
    };
    const withReplies = (replies?: number): JudgePromptInput => ({ ...JUDGE_INPUT, scene: { ...JUDGE_INPUT.scene!, replies } });

    it('sets the passed-by threshold at 20', () => {
        expect(PASSED_BY_REPLIES).toBe(20);
    });

    it('is not in the prompt under the threshold, nor when the count is left out', () => {
        for (const input of [withReplies(PASSED_BY_REPLIES - 1), withReplies(0), withReplies(undefined), JUDGE_INPUT]) {
            const user = buildJudgePrompt(input).messages[1].content;
            expect(user).not.toContain('passed_by');
            expect(user).not.toContain('Passed-by rule');
        }
        // Under the threshold the Current Scene section is as it was.
        expect(currentScene(withReplies(PASSED_BY_REPLIES - 1))).toBe(
            '# Current Scene\nMare\'s milk. Move-on condition: Ash tastes the milk and openly asks where the tribe keeps its cows.\n\n',
        );
    });

    it('from the threshold, the Current Scene section adds the rule: clearly gone elsewhere, nothing heading back, went_to says where', () => {
        for (const replies of [PASSED_BY_REPLIES, 43]) {
            const section = currentScene(withReplies(replies));
            expect(section).toContain('Move-on condition: Ash tastes the milk and openly asks where the tribe keeps its cows.\nPassed-by rule:');
            expect(section).toContain('This Scene has gone on a long time.');
            expect(section).toContain('"passed_by": true only when the story has clearly gone somewhere the move-on condition can\'t happen soon');
            expect(section).toContain('nothing in the latest exchanges is heading back toward it');
            // 2026-11-12: where the story went is its own field, never the reason, which may restate the condition wrongly.
            expect(section).toContain('then also give "went_to": one short sentence saying where the story went instead, never what has or hasn\'t happened.');
            expect(section).not.toContain('the reason must say where the story went');
            expect(section).toContain('When in doubt, passed_by is false.');
        }
    });

    // Seen in live Chat 2 on 2026-11-13/14: three Scenes in a row were passed by during the wedding
    // night and the morning after, each "went to" the camp, so the Chat landed in a winter barn while
    // the story stayed at the summer market.
    it('from the threshold, says a private interlude is not the story going elsewhere', () => {
        expect(currentScene(withReplies(PASSED_BY_REPLIES))).toContain(
            'A private interlude (a love scene, a night together, a meal, a bath, a rest) is not the story going somewhere else: the story comes back from it.',
        );
        expect(currentScene(withReplies(PASSED_BY_REPLIES - 1))).not.toContain('private interlude');
    });

    it('from the threshold, shows the next Scene and allows passing by only when it can begin from where the story is', () => {
        const next = { name: 'Toll at the River Bridge', situation: 'Five days south, the road meets the river.' };
        const section = currentScene({ ...JUDGE_INPUT, scene: { ...JUDGE_INPUT.scene!, replies: PASSED_BY_REPLIES, next } });
        expect(section).toContain('Passed by, the story goes on to the next Scene: Toll at the River Bridge. Five days south, the road meets the river.');
        expect(section).toContain(
            'Set passed_by only when that Scene can begin from where the story is now, not when it needs a place, a season or an event the story has not reached.',
        );
        // Under the threshold the next Scene is not shown.
        expect(currentScene({ ...JUDGE_INPUT, scene: { ...JUDGE_INPUT.scene!, replies: 3, next } })).not.toContain('Toll at the River Bridge');
    });

    it('from the threshold on the last Scene, says passing by ends in free play', () => {
        const section = currentScene({ ...JUDGE_INPUT, scene: { ...JUDGE_INPUT.scene!, replies: PASSED_BY_REPLIES, next: null } });
        expect(section).toContain('Passed by, the story goes on in free play: this is the last Scene.');
        expect(section).not.toContain('can begin from where the story is now');
    });

    it('is never given in free play', () => {
        expect(buildJudgePrompt({ ...JUDGE_INPUT, scene: null }).messages[1].content).not.toContain('Passed-by rule');
    });

    it('the reply shape gains "passed_by": false and "went_to": null next to move_on', () => {
        expect(buildJudgePrompt(JUDGE_INPUT).messages[0].content).toContain('"scene":{"reason":"...","move_on":false,"passed_by":false,"went_to":null}');
    });
});

describe('Reading passed_by and went_to from the Judge', () => {
    const judged = (scene: unknown) => parseJudgement(JSON.stringify({ bond_changes: [], arc_steps: [], scene })).scenes;

    it('reads passed_by, and a missing or non-true one is false', () => {
        expect(judged({ reason: 'The story went to the lord\'s fire.', move_on: false, passed_by: true })).toEqual([
            { moveOn: false, passedBy: true, reason: 'The story went to the lord\'s fire.', wentTo: '' },
        ]);
        expect(judged({ reason: 'Not yet.', move_on: false })).toEqual([{ moveOn: false, passedBy: false, reason: 'Not yet.', wentTo: '' }]);
        expect(judged({ reason: 'Not yet.', move_on: false, passed_by: 'true' })).toEqual([{ moveOn: false, passedBy: false, reason: 'Not yet.', wentTo: '' }]);
    });

    it('reads went_to trimmed, and a missing, null or non-string one is empty', () => {
        const passed = { reason: 'Ash has not asked about the cows.', move_on: false, passed_by: true };
        expect(judged({ ...passed, went_to: '  The story went to the lord\'s fire.  ' })).toEqual([
            { moveOn: false, passedBy: true, reason: 'Ash has not asked about the cows.', wentTo: 'The story went to the lord\'s fire.' },
        ]);
        for (const wentTo of [undefined, null, 3, true, ['The fire.']]) {
            expect(judged({ ...passed, went_to: wentTo })[0].wentTo).toBe('');
        }
    });
});

describe('Applying a passed-by judgement', () => {
    const NARA = 1;
    const scenes = [
        { id: 10, name: 'Mare\'s milk', moveOnCondition: 'Ash asks about the cows.', gates: [{ fromCharacterId: NARA, toCharacterId: null, axis: 'trust' as const, atLeast: 3 }] },
        { id: 11, name: 'The guest tent', moveOnCondition: 'Nara tells a secret.', gates: [] },
        { id: 12, name: 'The fire', moveOnCondition: '', gates: [] },
    ];
    const input = (overrides: Partial<ApplyInput> = {}): ApplyInput => ({
        cast: [{ id: NARA, name: 'Nara' }],
        identityName: 'Ash',
        bonds: [{ fromCharacterId: NARA, toCharacterId: null, label: 'Unsure', description: '', levels: { trust: 0, affection: 0, desire: 0, tension: 0 } }],
        scenes,
        currentSceneId: 10,
        repliesInScene: PASSED_BY_REPLIES,
        ...overrides,
    });
    const judgement = (scene: { moveOn?: boolean; passedBy?: boolean; reason: string; wentTo?: string }): Judgement => ({
        bondChanges: [],
        arcSteps: [],
        scenes: [{ moveOn: scene.moveOn ?? false, passedBy: scene.passedBy ?? false, reason: scene.reason, wentTo: scene.wentTo ?? '' }],
        timeOfDay: null,
        expressions: [],
    });
    // Seen in play (2026-11-12): the reason restated the condition, and wrongly ("has not yet tasted the milk").
    const REASON = 'Ash has not yet tasted the milk or asked about the cows. The talk is all of the stall.';
    const WENT_TO = 'The story went to the stall and the lord\'s fire.';
    const PASSED = judgement({ passedBy: true, reason: REASON, wentTo: WENT_TO });

    it('at the threshold, moves to the next Scene past an unmet condition and an unheld gate, saying where the story went', () => {
        const applied = applyJudgement(input(), PASSED);
        expect(applied.scene).toEqual({
            fromSceneId: 10,
            fromSceneName: 'Mare\'s milk',
            toSceneId: 11,
            toSceneName: 'The guest tent',
            event: `The story moved past Mare's milk: ${WENT_TO}`,
        });
        expect(applied.rejected).toEqual([]);
        // The log keeps the Judge's whole reason; the event never shows it.
        expect(applied.passedBy).toBe(REASON);
    });

    it('with went_to missing or blank, the event names only the Scene, never the reason', () => {
        for (const wentTo of ['', '   ', undefined]) {
            const applied = applyJudgement(input(), judgement({ passedBy: true, reason: REASON, wentTo }));
            expect(applied.scene).toMatchObject({ fromSceneId: 10, toSceneId: 11, event: 'The story moved past Mare\'s milk.' });
            expect(applied.passedBy).toBe(REASON);
        }
        // A judgement with no wentTo field at all.
        const without = applyJudgement(input(), { ...PASSED, scenes: [{ moveOn: false, passedBy: true, reason: REASON }] });
        expect(without.scene?.event).toBe('The story moved past Mare\'s milk.');
    });

    it('under the threshold, or with no count, is rejected and the Scene stays', () => {
        for (const repliesInScene of [PASSED_BY_REPLIES - 1, 0, undefined, null]) {
            const applied = applyJudgement(input({ repliesInScene }), PASSED);
            expect(applied.scene).toBeNull();
            expect(applied.passedBy).toBeNull();
            expect(applied.rejected).toEqual([expect.stringMatching(/^Scene: passed by with only \d+ replies in the Scene/)]);
        }
    });

    it('in free play, is rejected', () => {
        const applied = applyJudgement(input({ currentSceneId: null, repliesInScene: null }), PASSED);
        expect(applied.scene).toBeNull();
        expect(applied.rejected).toEqual(['Scene: passed by while in free play']);
    });

    it('with move_on too, move_on wins: one advance, with its reason', () => {
        const scenesWithoutGates = scenes.map((scene) => ({ ...scene, gates: [] }));
        const both = judgement({ moveOn: true, passedBy: true, reason: 'Ash asked about the cows.', wentTo: WENT_TO });
        const applied = applyJudgement(input({ scenes: scenesWithoutGates }), both);
        // A move_on event is unchanged: its reason, never went_to.
        expect(applied.scene).toMatchObject({ toSceneId: 11, event: 'Ash asked about the cows.' });
        expect(applied.passedBy).toBeNull();
    });

    it('from the last Scene, goes to free play', () => {
        const applied = applyJudgement(input({ currentSceneId: 12 }), PASSED);
        expect(applied.scene).toMatchObject({ fromSceneId: 12, toSceneId: null, toSceneName: null, event: `The story moved past The fire: ${WENT_TO}` });
    });
});

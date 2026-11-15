import { mapCard } from '../src/manager/character-card/card-mapping.js';
import { readCardJson } from '../src/manager/character-card/card-reader.js';
import { buildTurnPrompt, PromptLayersInput, styleControlLines, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { validateDraft } from '../src/manager/story-drafting/draft-schema.js';
import { Balance, Difficulty, Pacing, Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { v2Card } from './harness/card-files.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Style controls (.scratch/style-controls/spec.md): a Story's Pacing, its balance of dialogue and
 * action, and its Difficulty. The middle value of each says nothing to the Narrator, so a Story
 * that sets none plays as before. The pure prompt, draft and card first, then the HTTP API.
 */

const FAST = 'Pacing: brisk. Move the scene forward in every reply and skip over what is routine.';
const SLOW = "Pacing: slow burn. Let moments breathe, and don't hurry toward a resolution, a confession or a change of scene.";
const DIALOGUE = 'Lean on dialogue: let the Characters talk, with only the narration the talk needs.';
const ACTION = 'Lean on action and description: show what happens and what is there, with speech only where it counts.';
const EASY = 'The world is forgiving: what Ash attempts tends to work, and setbacks are light and soon past.';
const HARD = "The world is hard: what Ash attempts can fail or cost something, and nobody gives way easily. Don't soften a failure the story has earned.";

function layers(style: Partial<PromptLayersInput['story']> = {}): PromptLayersInput {
    return {
        story: {
            setting: 'A lighthouse.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.', exampleLines: [], background: '', secrets: '' }],
            ...style,
        },
        identity: { name: 'Ash', description: 'The keeper.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
    };
}

function input(style: Partial<PromptLayersInput['story']> = {}): TurnPromptInput {
    return { ...layers(style), history: [{ role: 'assistant', text: '@Mira: The lamp is out.' }], userText: 'I climb to the lamp.', present: ['Mira'] };
}

const systemOf = (prompt: { messages: Array<{ content: string }> }) => prompt.messages[0].content;
const STYLE_AS_BEFORE = '# Style\n- Write in English, second person for Ash ("you"), present tense.\n- Reply length: 150–350 words in total.\n\n#';

describe('Style controls: the turn prompt (pure)', () => {
    it('says nothing at the middle values: the prompt equals one built without the fields, and the Style layer is the two lines it always was', () => {
        const before = buildTurnPrompt(input());
        expect(buildTurnPrompt(input({ pacing: Pacing.Natural, balance: Balance.Balanced, difficulty: Difficulty.Normal }))).toEqual(before);
        expect(systemOf(before)).toContain(STYLE_AS_BEFORE);
        expect(styleControlLines({}, 'Ash')).toEqual([]);
    });

    it('adds one Style line per control off its middle value, in the order Pacing, balance, Difficulty, naming the worn identity', () => {
        const system = systemOf(buildTurnPrompt(input({ pacing: Pacing.Slow, balance: Balance.Action, difficulty: Difficulty.Hard })));
        expect(system).toContain(`- Reply length: 150–350 words in total.\n- ${SLOW}\n- ${ACTION}\n- ${HARD}\n\n#`);
        expect(styleControlLines({ pacing: Pacing.Fast, balance: Balance.Dialogue, difficulty: Difficulty.Easy }, 'Ash')).toEqual([FAST, DIALOGUE, EASY]);
        expect(styleControlLines({ balance: Balance.Dialogue }, 'Ash')).toEqual([DIALOGUE]);
    });

    it('lives in the system message only, and leaves the reply length and its token cap alone', () => {
        const plain = buildTurnPrompt(input());
        const set = buildTurnPrompt(input({ pacing: Pacing.Fast, difficulty: Difficulty.Easy }));
        expect(set.maxTokens).toBe(plain.maxTokens);
        expect(set.messages.slice(1)).toEqual(plain.messages.slice(1));
    });
});

const DRAFT = {
    title: 'The Lighthouse',
    setting: 'A storm-cut island.',
    opening: 'The lamp went out.',
    role: { name: 'Ash', description: 'The new keeper.' },
    characters: [{ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' }],
};

describe('Style controls: a Story draft and a Character card (pure)', () => {
    it('a draft that names none gets the middle values; one that names them keeps them; a value outside the set is refused', () => {
        expect(validateDraft({ ...DRAFT, style: { pov: 'first' } }).style).toMatchObject({ pacing: 'natural', balance: 'balanced', difficulty: 'normal' });
        expect(validateDraft({ ...DRAFT, style: { pacing: 'slow', balance: 'dialogue', difficulty: 'hard' } }).style).toMatchObject({
            pacing: 'slow',
            balance: 'dialogue',
            difficulty: 'hard',
        });
        expect(() => validateDraft({ ...DRAFT, style: { pacing: 'glacial' } })).toThrow('Style pacing must be one of fast, natural, slow.');
    });

    it("a card's Storytell block brings them in; a value outside the set is left unset, as for POV", () => {
        const block = (style: object) => v2Card({ extensions: { storytell: { version: 1, character: {}, role: { name: 'Ash', description: '' }, style } } });
        const plan = (card: unknown) => mapCard(readCardJson(JSON.stringify(card)).card, { roleName: 'Ash', greeting: 0 });
        expect(plan(block({ pacing: 'fast', balance: 'action', difficulty: 'easy' })).story).toMatchObject({ pacing: 'fast', balance: 'action', difficulty: 'easy' });
        const odd = plan(block({ pacing: 'glacial', difficulty: 7 })).story;
        expect(odd.pacing).toBeUndefined();
        expect(odd.balance).toBeUndefined();
        expect(odd.difficulty).toBeUndefined();
    });
});

interface Story {
    id: number;
    style: { pacing: string; balance: string; difficulty: string; replyLength: string };
    characters: Array<{ id: number }>;
}

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

describe('Style controls: the API', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createStory(): Promise<Story> {
        const id = (await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${id}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: 'The lamp went out.\n\n@Mira: Boots off.' }).expect(200);
        await t.http.patch(`/api/stories/${id}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        return (await t.http.post(`/api/stories/${id}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' }).expect(201)).body as Story;
    }

    async function turnSystem(storyId: number, chatId: number): Promise<string> {
        t.gateway.scriptText('turn', '@Mira: Hm.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'I look around.' }).expect(201);
        return t.gateway.textCalls('turn').at(-1)!.messages[0].content;
    }

    it('a new Story has the middle values, a PATCH sets each, and the next turn tells the Narrator; back at the middle, the lines are gone', async () => {
        const story = await createStory();
        expect(story.style).toMatchObject({ pacing: 'natural', balance: 'balanced', difficulty: 'normal' });
        const chatId = (await t.http.post(`/api/stories/${story.id}/chats`).expect(201)).body.id as number;
        const before = await turnSystem(story.id, chatId);
        expect(before).not.toContain('Pacing:');
        expect(before).not.toContain('Lean on');
        expect(before).not.toContain('The world is');

        const patched = (await t.http.patch(`/api/stories/${story.id}`).send({ pacing: 'slow', balance: 'dialogue', difficulty: 'hard' }).expect(200)).body as Story;
        expect(patched.style).toMatchObject({ pacing: 'slow', balance: 'dialogue', difficulty: 'hard', replyLength: 'medium' });
        const set = await turnSystem(story.id, chatId);
        expect(set).toContain(`- ${SLOW}\n- ${DIALOGUE}\n- ${HARD}`);
        expect(set.indexOf('# Style')).toBeLessThan(set.indexOf(SLOW));

        await t.http.patch(`/api/stories/${story.id}`).send({ pacing: 'natural', balance: 'balanced', difficulty: 'normal' }).expect(200);
        expect(await turnSystem(story.id, chatId)).toBe(before);
    });

    it('a duplicate keeps them, and the Story assistant can set them', async () => {
        const story = await createStory();
        await t.http.patch(`/api/stories/${story.id}`).send({ pacing: 'fast', difficulty: 'easy' }).expect(200);
        const copy = (await t.http.post(`/api/stories/${story.id}/duplicate`).expect(201)).body as Story;
        expect(copy.style).toMatchObject({ pacing: 'fast', balance: 'balanced', difficulty: 'easy' });

        t.gateway.scriptText(
            'story_assistant',
            JSON.stringify({
                reply: 'Slower, talkier, harder.',
                changes: [
                    { op: 'set', target: 'style', field: 'pacing', value: 'slow' },
                    { op: 'set', target: 'story', field: 'balance', value: 'dialogue' },
                    { op: 'set', target: 'story', field: 'difficulty', value: 'hard' },
                ],
            }),
        );
        const answer = (await t.http.post(`/api/stories/${story.id}/assistant`).send({ instruction: 'Make it a slow, talky, hard story.' }).expect(200)).body as {
            story: Story;
            changes: Array<{ field: string; before: string; after: string; label: string }>;
        };
        expect(answer.story.style).toMatchObject({ pacing: 'slow', balance: 'dialogue', difficulty: 'hard' });
        expect(answer.changes.map(({ field, before, after, label }) => ({ field, before, after, label }))).toEqual([
            { field: 'pacing', before: 'fast', after: 'slow', label: 'Pacing' },
            { field: 'balance', before: 'balanced', after: 'dialogue', label: 'Dialogue or action' },
            { field: 'difficulty', before: 'easy', after: 'hard', label: 'Difficulty' },
        ]);

        // A value outside the set is an unusable answer from the assistant: refused, with nothing changed.
        t.gateway.scriptText('story_assistant', JSON.stringify({ reply: 'Glacial.', changes: [{ op: 'set', target: 'story', field: 'pacing', value: 'glacial' }] }));
        await t.http.post(`/api/stories/${story.id}/assistant`).send({ instruction: 'Make it glacial.' }).expect(502);
        expect((await t.http.get(`/api/stories/${story.id}`).expect(200)).body.style).toMatchObject({ pacing: 'slow' });
    });
});

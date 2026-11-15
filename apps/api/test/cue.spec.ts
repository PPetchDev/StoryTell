import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { STORY_SO_FAR_TRIGGER_MARGIN, storySoFarCoverage } from '../src/manager/chat/story-so-far/story-so-far-prompt.js';
import { buildSuggestionsPrompt } from '../src/manager/chat/suggestions/suggestions-prompt.js';
import { buildTurnPrompt, CUE_MAX, cueBlock, estimateTokens, PromptLayersInput, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * The Cue (CONTEXT.md): a few words from the user to the Narrator for one reply, sent with a
 * Message, a Continue, a Retry, a Regenerate or a User Message edit. The pure prompt first, then
 * through the HTTP API with the fake gateway scripted.
 */

function layers(overrides: Partial<PromptLayersInput> = {}): PromptLayersInput {
    return {
        story: {
            setting: 'A lighthouse.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [
                { name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.', exampleLines: [], background: '', secrets: '' },
                { name: 'Kai', appearance: 'Wiry.', personality: 'Restless.', voice: 'Quick.', exampleLines: [], background: '', secrets: '' },
            ],
        },
        identity: { name: 'Ash', description: 'The keeper.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
        ...overrides,
    };
}

function input(overrides: Partial<TurnPromptInput> = {}): TurnPromptInput {
    return {
        ...layers(),
        history: [{ role: 'assistant', text: '@Mira: The lamp is out.\n\n@Kai: I can fix it.' }],
        userText: 'I climb to the lamp.',
        present: ['Mira', 'Kai'],
        ...overrides,
    };
}

const trailingOf = (prompt: { messages: Array<{ content: string }> }) => prompt.messages.at(-1)!.content;

const CUE = 'Make Mira angrier, and end on a cliffhanger.';
const CUE_LINE = `The user's cue for this reply only: ${CUE}`;
const CUE_RULES =
    'Follow it in this one reply. It is a steer, not something that happened: never quote it or mention it, and write the story in English whatever language the cue is in. It never overrides the rules about Ash: never write anything Ash says, thinks, feels, decides or does.';

describe('Cue: the turn prompt (pure)', () => {
    it('puts the block after "Where things stand" and the Nudge, and just before the final instruction, in the trailing message only', () => {
        const prompt = buildTurnPrompt(input({ cue: CUE, nudge: 'Kai', authorsNote: 'Keep it moody.' }));
        const trailing = trailingOf(prompt);
        expect(cueBlock(CUE, 'Ash')).toBe(`${CUE_LINE}\n${CUE_RULES}`);
        expect(trailing.indexOf("# Author's note")).toBeLessThan(trailing.indexOf('Where things stand:'));
        expect(trailing.indexOf('would like to hear from Kai')).toBeLessThan(trailing.indexOf(CUE_LINE));
        expect(trailing).toContain(`\n${CUE_LINE}\n${CUE_RULES}\nWrite the next turn now.`);
        expect(prompt.messages.slice(0, -1).some((message) => message.content.includes('cue for this reply'))).toBe(false);
    });

    it('trims the Cue, and adds nothing for none or a blank one: the prompt equals one built without the field', () => {
        const today = buildTurnPrompt(input());
        expect(buildTurnPrompt(input({ cue: null }))).toEqual(today);
        expect(buildTurnPrompt(input({ cue: '   \n ' }))).toEqual(today);
        expect(trailingOf(today)).not.toContain('cue for this reply');
        expect(trailingOf(buildTurnPrompt(input({ cue: `  ${CUE}\n` })))).toContain(`${CUE_LINE}\n${CUE_RULES}`);
    });

    it('leaves the system message, and with it the cached prefix, the same with a Cue', () => {
        expect(buildTurnPrompt(input({ cue: CUE })).messages[0]).toEqual(buildTurnPrompt(input()).messages[0]);
    });

    it('rides on a Continue turn too, whose user message stays the continue instruction', () => {
        const prompt = buildTurnPrompt(input({ userText: null, cue: 'Skip to the next morning.' }));
        expect(prompt.messages.at(-2)!.content).toContain('Continue the story from exactly where it stands');
        expect(trailingOf(prompt)).toContain("The user's cue for this reply only: Skip to the next morning.");
    });

    it('is allowed for by the Story so far trigger: a turn with the longest Cue and a Nudge still fits inside the margin at the smallest budget that needs none', () => {
        const messages = Array.from({ length: 20 }, (_, i) => ({ role: (i % 2 === 0 ? 'assistant' : 'user') as 'user' | 'assistant', text: `M${i} ${'x'.repeat(796)}` }));
        let budget = 5_000;
        while (storySoFarCoverage(layers(), messages, budget) !== null) budget += 1;
        // The trigger stands in 300 tokens for the next user message, and the cast for who is present.
        const turn = buildTurnPrompt({
            ...layers(),
            history: messages,
            userText: 'u'.repeat(1_200),
            present: ['Mira', 'Kai'],
            nudge: 'Kai',
            cue: 'c'.repeat(CUE_MAX),
            tokenBudget: budget,
        });
        const total = turn.messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
        expect(turn.trimmed).toBe(0);
        expect(total + STORY_SO_FAR_TRIGGER_MARGIN).toBeLessThanOrEqual(budget);
    });

    it('is turn-only: Suggested replies never carry it', () => {
        const withCue = { ...layers(), cue: CUE, history: [{ role: 'assistant' as const, text: '@Kai: Hm.' }] } as Parameters<typeof buildSuggestionsPrompt>[0];
        expect(JSON.stringify(buildSuggestionsPrompt(withCue))).not.toContain('cue for this reply');
    });
});

interface Message {
    id: number;
    kind: 'user' | 'ai';
    judge?: { status: 'pending' | 'done' | 'failed' } | null;
    memory?: { status: 'pending' | 'done' | 'failed' } | null;
}

interface Chat {
    id: number;
    messages: Message[];
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

describe('Cue: the API', () => {
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

    async function createChat(): Promise<{ storyId: number; chat: Chat }> {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' }).expect(201);
        return { storyId, chat: (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat };
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
    }

    /** Returns once neither of the latest reply's background calls is pending. */
    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(storyId, chatId);
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    function script(reply: string): void {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    const trailing = (call: TextCompletionRequest) => call.messages.at(-1)!.content;
    const textCalls = (from: number) => t.gateway.calls.slice(from).flatMap((call) => (call.method === 'completeText' ? [call.request] : []));
    const MARK = 'cue for this reply only: ';

    it('carries the Cue on a send, a Continue, a Regenerate, a Retry and a User Message edit; the next turn without one has none, and nothing stores it', async () => {
        const { storyId, chat } = await createChat();
        const base = `/api/stories/${storyId}/chats/${chat.id}`;
        const from = t.gateway.calls.length;

        script('@Mira: Out. Now.');
        await t.http.post(`${base}/messages`).send({ text: 'I look around.', cue: 'Make Mira angrier.' }).expect(201);
        await settled(storyId, chat.id);
        script('Morning comes grey.');
        await t.http.post(`${base}/continue`).send({ cue: 'Skip to the next morning.' }).expect(200);
        const continued = await settled(storyId, chat.id);
        script('Morning comes bright.');
        await t.http.post(`${base}/messages/${continued.messages.at(-1)!.id}/regenerate`).send({ cue: 'Same, but sunny.' }).expect(200);
        await settled(storyId, chat.id);
        // A failed turn, sent without one, then Retry with one.
        t.gateway.scriptText('turn', new ProviderOutageError('DeepInfra answered 503.'));
        await t.http.post(`${base}/messages`).send({ text: 'Hello?' }).expect(502);
        script('@Mira: Here.');
        await t.http.post(`${base}/retry`).send({ cue: 'She answers from upstairs.' }).expect(200);
        const retried = await settled(storyId, chat.id);
        script('@Mira: Up here.');
        await t.http.patch(`${base}/messages/${retried.messages.at(-2)!.id}`).send({ text: 'Hello? Anyone?', cue: '  A blank cue is no cue?  ' }).expect(200);
        await settled(storyId, chat.id);
        script('@Mira: Fine.');
        await t.http.post(`${base}/messages`).send({ text: 'I sit down.', cue: '   ' }).expect(201);
        const last = await settled(storyId, chat.id);

        const turns = textCalls(from).filter((call) => call.kind === 'turn');
        expect(turns).toHaveLength(7);
        const cueOf = (turn: TextCompletionRequest) => trailing(turn).split('\n').find((line) => line.includes(MARK))?.split(MARK)[1] ?? null;
        expect(turns.map(cueOf)).toEqual([
            'Make Mira angrier.',
            'Skip to the next morning.',
            'Same, but sunny.',
            null,
            'She answers from upstairs.',
            'A blank cue is no cue?',
            null,
        ]);
        for (const turn of turns.filter((call) => cueOf(call) !== null)) {
            expect(trailing(turn).indexOf('Where things stand:')).toBeLessThan(trailing(turn).indexOf(MARK));
            expect(trailing(turn).indexOf(MARK)).toBeLessThan(trailing(turn).indexOf('Write the next turn now.'));
            expect(turn.messages.slice(0, -1).some((message) => message.content.includes(MARK))).toBe(false);
        }
        // The judge and the extraction never hold it, and no Message keeps it.
        const background = textCalls(from).filter((call) => call.kind !== 'turn');
        expect(background.length).toBeGreaterThan(0);
        expect(background.some((call) => call.messages.some((message) => message.content.includes('cue for this reply')))).toBe(false);
        const stored = JSON.stringify(last);
        for (const cue of ['angrier', 'next morning', 'but sunny', 'from upstairs', 'blank cue']) expect(stored).not.toContain(cue);
    });

    it(`refuses a Cue over ${CUE_MAX} characters or one that is not text (400), storing nothing and making no call`, async () => {
        const { storyId, chat } = await createChat();
        const base = `/api/stories/${storyId}/chats/${chat.id}`;

        const long = await t.http.post(`${base}/messages`).send({ text: 'I look around.', cue: 'c'.repeat(CUE_MAX + 1) }).expect(400);
        expect(long.body.error.code).toBe('400.000.000');
        await t.http.post(`${base}/continue`).send({ cue: 42 }).expect(400);

        expect((await getChat(storyId, chat.id)).messages).toEqual(chat.messages);
        expect(t.gateway.textCalls()).toHaveLength(0);

        script('@Mira: Hm.');
        await t.http.post(`${base}/messages`).send({ text: 'I look around.', cue: 'c'.repeat(CUE_MAX) }).expect(201);
    });
});

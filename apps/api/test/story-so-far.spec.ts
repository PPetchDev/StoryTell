import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { storySoFarCoverage } from '../src/manager/chat/story-so-far/story-so-far-prompt.js';
import { buildTurnPrompt, PROMPT_LAYERS, PromptLayersInput } from '../src/manager/chat/turn/prompt.js';
import { buildSuggestionsPrompt } from '../src/manager/chat/suggestions/suggestions-prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface Message {
    id: number;
    kind: 'user' | 'ai';
    position: number;
    judge?: { status: 'pending' | 'done' | 'failed' } | null;
    memory?: { status: 'pending' | 'done' | 'failed' } | null;
}

interface Chat {
    id: number;
    messages: Message[];
}

interface StorySoFar {
    chatId: number;
    text: string | null;
    coveredMessages: number;
    writtenBy: 'ai' | 'user';
    updatedAt: string | null;
    failedReason: string | null;
}

const OPENING = `The lamp went out an hour ago. Rain hammers the gallery windows.

@Mira: You're late. Boots off, keeper.`;

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

/** A reply of about 5k tokens, so three of them outgrow the 16k turn prompt; `tag` marks it. */
function longReply(tag: string): string {
    return `${tag} The storm keeps on. ${'Waves break on the rocks below the lamp room and the tower shakes. '.repeat(290)}`;
}

/** Layers for the pure prompt tests: small, so the token arithmetic is easy to follow. */
function layers(storySoFar: PromptLayersInput['storySoFar'] = null): PromptLayersInput {
    return {
        story: {
            setting: 'A lighthouse.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.', exampleLines: [], background: '', secrets: '' }],
        },
        identity: { name: 'Ash', description: 'The keeper.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
        storySoFar,
    };
}

const history = (count: number, words = 10) =>
    Array.from({ length: count }, (_, i) => ({ role: (i % 2 === 0 ? 'assistant' : 'user') as 'user' | 'assistant', text: `M${i} ${'word '.repeat(words)}` }));

describe('Story so far: prompt (pure)', () => {
    it('sends the Story so far after Memory and leaves the Messages it covers out of the history', () => {
        const prompt = buildTurnPrompt({ ...layers({ text: 'Ash arrived in the storm.', coveredMessages: 3 }), history: history(6), userText: 'Hello?' });
        const system = prompt.messages[0].content;
        expect(system.indexOf(PROMPT_LAYERS.storySoFar)).toBeGreaterThan(system.indexOf(PROMPT_LAYERS.memory));
        expect(system).toContain('Ash arrived in the storm.');
        const sent = prompt.messages.slice(1, -2).map((message) => message.content);
        expect(sent.map((text) => text.split(' ')[0])).toEqual(['M3', 'M4', 'M5']);
        expect(prompt.trimmed).toBe(0);
    });

    it('is exactly as before with no Story so far', () => {
        const prompt = buildTurnPrompt({ ...layers(null), history: history(4), userText: 'Hello?' });
        expect(prompt.messages[0].content).not.toContain(PROMPT_LAYERS.storySoFar);
        expect(prompt.messages).toHaveLength(4 + 3);
    });

    it('gives Suggested replies the layer and the same uncovered history', () => {
        const prompt = buildSuggestionsPrompt({ ...layers({ text: 'Ash arrived in the storm.', coveredMessages: 2 }), history: history(4) });
        expect(prompt.messages[0].content).toContain('Ash arrived in the storm.');
        expect(prompt.messages.slice(1, -1).map((message) => message.content.split(' ')[0])).toEqual(['M2', 'M3']);
    });

    it('asks for no update while the Chat fits, and covers enough to leave headroom once it nears the edge', () => {
        expect(storySoFarCoverage(layers(), history(10, 100), 16_000)).toBeNull();
        // 30 Messages of ~130 tokens each are ~3.9k tokens: past a 4k budget's room minus the margin.
        const next = storySoFarCoverage(layers(), history(30, 100), 4_000);
        expect(next).toBeGreaterThan(0);
        // The newest two are always sent word for word.
        expect(next).toBeLessThanOrEqual(28);
    });
});

describe('Story so far', () => {
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

    async function createStory(): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded.', voice: 'Short sentences.' })
            .expect(201);
        return storyId;
    }

    async function createChat(storyId: number): Promise<Chat> {
        const { body } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return body as Chat;
    }

    const path = (storyId: number, chatId: number) => `/api/stories/${storyId}/chats/${chatId}/story-so-far`;

    async function storySoFar(storyId: number, chatId: number): Promise<StorySoFar> {
        const { body } = await t.http.get(path(storyId, chatId)).expect(200);
        return body as StorySoFar;
    }

    /** Sends a turn and waits for its judge and extraction, and then for any Story so far update. */
    async function send(storyId: number, chatId: number, text: string, reply: string): Promise<Chat> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        await t.app.get(ChatManagerService).backgroundIdle(chatId);
        return settled(storyId, chatId);
    }

    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
            const chat = body as Chat;
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    /** Plays turns of long replies until a Story so far exists; returns how many turns that took. */
    async function playUntilSummarised(storyId: number, chatId: number, summary: string): Promise<number> {
        t.gateway.scriptText('story_summary', summary);
        for (let turn = 1; turn <= 6; turn++) {
            await send(storyId, chatId, `Turn ${turn}.`, longReply(`REPLY-${turn}`));
            if ((await storySoFar(storyId, chatId)).text !== null) return turn;
        }
        throw new Error('No Story so far was written');
    }

    it('makes no call and has none while the whole Chat fits, and refuses a save then', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);

        await send(storyId, chat.id, 'Hello?', '@Mira: Boots off.');

        expect(t.gateway.textCalls('story_summary')).toHaveLength(0);
        expect(await storySoFar(storyId, chat.id)).toMatchObject({ text: null, coveredMessages: 0, failedReason: null });
        const refused = await t.http.put(path(storyId, chat.id)).send({ text: 'Something.' }).expect(409);
        expect(refused.body.error.code).toBe('409.004.017');
    });

    it('writes it from every covered Message before any falls out, and the next turn sends it in their place', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);

        const turns = await playUntilSummarised(storyId, chat.id, 'Ash came through the storm and Mira took the first watch.');

        const [call] = t.gateway.textCalls('story_summary');
        expect(call.servedFor).toEqual({ storyId, chatId: chat.id });
        const input = call.messages.map((message) => message.content).join('\n');
        expect(input).toContain('Rain hammers the gallery windows.');
        expect(input).toContain('REPLY-1');
        expect(input).toContain("never guess Ash's gender");
        expect(input).toContain('never call anyone a girl, boy, child or kid');
        const view = await storySoFar(storyId, chat.id);
        expect(view).toMatchObject({ text: 'Ash came through the storm and Mira took the first watch.', writtenBy: 'ai', failedReason: null });
        expect(view.coveredMessages).toBeGreaterThan(0);
        // Nothing fell out uncovered: every turn so far sent the whole history.
        for (const turn of t.gateway.textCalls('turn').slice(0, turns)) {
            expect(turn.messages[1].content).toContain('Rain hammers the gallery windows.');
        }

        await send(storyId, chat.id, 'Next.', '@Mira: Watch the lamp.');
        const next = t.gateway.textCalls('turn').at(-1)!;
        expect(next.messages[0].content).toContain(`${PROMPT_LAYERS.storySoFar}`);
        expect(next.messages[0].content).toContain('Ash came through the storm and Mira took the first watch.');
        expect(next.messages.slice(1).map((message) => message.content).join('\n')).not.toContain('Rain hammers the gallery windows.');
    });

    it("rewrites from every covered Message each time, and keeps the user's corrections in every rewrite", async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        await playUntilSummarised(storyId, chat.id, 'First account.');

        const saved = await t.http.put(path(storyId, chat.id)).send({ text: '  Ash promised Mira the red lantern.  ' }).expect(200);
        expect(saved.body).toMatchObject({ text: 'Ash promised Mira the red lantern.', writtenBy: 'user' });

        t.gateway.scriptText('story_summary', 'Second account.', 'Third account.');
        for (let turn = 1; t.gateway.textCalls('story_summary').length < 3 && turn <= 8; turn++) {
            await send(storyId, chat.id, `More ${turn}.`, longReply(`MORE-${turn}`));
        }
        const calls = t.gateway.textCalls('story_summary');
        expect(calls).toHaveLength(3);
        for (const later of calls.slice(1)) {
            const input = later.messages.map((message) => message.content).join('\n');
            // From scratch: the oldest Messages go in again, not only the last account.
            expect(input).toContain('Rain hammers the gallery windows.');
            expect(input).toContain('REPLY-1');
            expect(input).toContain("the user's version wins");
            expect(input).toContain('Ash promised Mira the red lantern.');
        }
        expect(await storySoFar(storyId, chat.id)).toMatchObject({ text: 'Third account.', writtenBy: 'ai' });
    });

    it('keeps the old text on a failure, never blocks a send, and tries again after the next turn', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        t.gateway.scriptText('story_summary', new ProviderOutageError('DeepInfra is down.'));
        for (let turn = 1; t.gateway.textCalls('story_summary').length === 0 && turn <= 6; turn++) {
            await send(storyId, chat.id, `Turn ${turn}.`, longReply(`REPLY-${turn}`));
        }
        const failed = await storySoFar(storyId, chat.id);
        expect(failed.text).toBeNull();
        expect(failed.failedReason).toContain('DeepInfra is down.');

        t.gateway.scriptText('story_summary', 'Recovered account.');
        await send(storyId, chat.id, 'Still here.', longReply('AFTER'));

        expect(t.gateway.textCalls('story_summary')).toHaveLength(2);
        expect(await storySoFar(storyId, chat.id)).toMatchObject({ text: 'Recovered account.', failedReason: null });
    });

    it('is cleared by an edit of a Message it covers, and by Reset', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        await playUntilSummarised(storyId, chat.id, 'An account.');
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chat.id}`).expect(200);
        const firstUser = (body as Chat).messages.find((message) => message.kind === 'user')!;

        t.gateway.scriptText('turn', '@Mira: Again, then.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${firstUser.id}`).send({ text: 'A different start.' }).expect(200);
        expect(await storySoFar(storyId, chat.id)).toMatchObject({ text: null, coveredMessages: 0 });
        await t.app.get(ChatManagerService).backgroundIdle(chat.id);
        await settled(storyId, chat.id);

        await playUntilSummarised(storyId, chat.id, 'Another account.');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200);
        expect(await storySoFar(storyId, chat.id)).toMatchObject({ text: null, coveredMessages: 0, writtenBy: 'ai' });
    });

    it('refuses an empty save', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        await playUntilSummarised(storyId, chat.id, 'An account.');
        const refused = await t.http.put(path(storyId, chat.id)).send({ text: '   ' }).expect(422);
        expect(refused.body.error.code).toBe('422.004.016');
    });
});

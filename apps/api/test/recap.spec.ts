import pg from 'pg';

import { SESSION_COOKIE, sessionKey, signSession } from '../src/api/auth/session.js';
import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountEntity, AccountRole } from '../src/model/account/entities/account.entity.js';
import { requestScope } from '../src/model/account/request-scope.js';
import { UsageRecordModelService } from '../src/model/usage-record/usage-record.service.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * "Previously on…" (.scratch/previously-on/spec.md), through the HTTP API with the Recap writer
 * scripted on the fake gateway. A gap is made by moving the Chat's Messages into the past.
 */

interface RecapView {
    due: boolean;
    recap: { messageId: number; text: string; dismissed: boolean; writtenAt: string } | null;
}

interface Chat {
    id: number;
    messages: Array<{ id: number; kind: 'user' | 'ai'; judge?: { status: string } | null; memory?: { status: string } | null }>;
}

const OPENING = 'Smoke curls from the fire.\n\n@Nara: Drink, guest.';
const NO_OPS = '{"operations":[]}';
const JUDGE = JSON.stringify({
    bond_changes: [{ from: 'Nara', to: 'user', label: 'Wary warmth', description: 'Likes {user} but watches the trade goods.', cause: 'The milk.' }],
    arc_steps: [],
    scene: { reason: 'Not yet.', move_on: false },
    details: { now: [{ character: 'Nara', note: 'Calls {user} "milk-thief".' }] },
});
const RECAP = 'Ash came to Nara’s fire a stranger and drank the mare’s milk. Nara warmed to them, but watches the trade goods. Whether Ash can be trusted is still unanswered.';
const SECRET = 'Nara is the khan’s lost daughter.';
const ARC = 'If trusted, she confesses her flight from the khan.';
const HOURS = 60 * 60 * 1000;

describe('"Previously on…"', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp({ backgroundWaitMs: 300 });
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function sql(text: string, params: unknown[] = []): Promise<any[]> {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            return (await client.query(text, params)).rows;
        } finally {
            await client.end();
        }
    }

    async function createChat(): Promise<{ storyId: number; chatId: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Steppe' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: "A herders' camp.", opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A trader passing through.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.', secrets: SECRET, arcDirections: ARC })
            .expect(201);
        const chat = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return { storyId, chatId: chat.body.id as number };
    }

    const getChat = async (storyId: number, chatId: number): Promise<Chat> => (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;

    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(storyId, chatId);
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The judge did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }

    async function play(storyId: number, chatId: number, text = 'I sip the milk.', reply = '@Nara: Slowly. It bites.'): Promise<Chat> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', JUDGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    /** Moves every Message of the Chat `hours` into the past: the user was away that long. */
    const away = (chatId: number, hours: number) => sql(`UPDATE "message" SET "created_at" = "created_at" - make_interval(secs => $2) WHERE "chat_id" = $1`, [chatId, hours * 3600]);

    const url = (storyId: number, chatId: number) => `/api/stories/${storyId}/chats/${chatId}/recap`;
    const read = async (storyId: number, chatId: number): Promise<RecapView> => (await t.http.get(url(storyId, chatId)).expect(200)).body as RecapView;
    const write = async (storyId: number, chatId: number): Promise<RecapView> => (await t.http.post(url(storyId, chatId)).expect(200)).body as RecapView;

    it('is not due while the user was just here, and is due after six hours away', async () => {
        const { storyId, chatId } = await createChat();
        await play(storyId, chatId);
        expect(await read(storyId, chatId)).toEqual({ due: false, recap: null });

        await away(chatId, 5.9);
        expect((await read(storyId, chatId)).due).toBe(false);
        await away(chatId, 0.2);
        expect(await read(storyId, chatId)).toEqual({ due: true, recap: null });
        expect(t.gateway.textCalls('previously_on')).toHaveLength(0);
    });

    it('is never due, and refuses a write, with only the Opening', async () => {
        const { storyId, chatId } = await createChat();
        await away(chatId, 48);
        expect((await read(storyId, chatId)).due).toBe(false);
        const refused = await t.http.post(url(storyId, chatId)).expect(409);
        expect(refused.body.error.code).toBe('409.004.120');
        expect(t.gateway.textCalls('previously_on')).toHaveLength(0);
    });

    it('is written once per gap from what the user may see, then served from the store until dismissed', async () => {
        const { storyId, chatId } = await createChat();
        const chat = await play(storyId, chatId);
        await away(chatId, 7);
        t.gateway.scriptText('previously_on', `Previously on…: ${RECAP}`);

        const written = await write(storyId, chatId);
        expect(written).toEqual({ due: true, recap: expect.objectContaining({ messageId: chat.messages.at(-1)!.id, text: RECAP, dismissed: false }) });
        // Opening the Chat again in the same gap: the same one, no new call.
        expect(await write(storyId, chatId)).toEqual(written);
        expect(await read(storyId, chatId)).toEqual(written);
        expect(t.gateway.textCalls('previously_on')).toHaveLength(1);

        const [call] = t.gateway.textCalls('previously_on');
        const prompt = call.messages.map((message) => message.content).join('\n');
        expect(call.maxTokens).toBe(400);
        expect(prompt).toContain('[Ash]\nI sip the milk.');
        expect(prompt).toContain('Nara toward Ash: "Wary warmth" — Likes Ash but watches the trade goods.');
        expect(prompt).toContain('Nara: Calls Ash "milk-thief".');
        expect(prompt).toContain('Everyone in the story is an adult');
        expect(prompt).not.toContain('khan');
        expect(prompt).not.toContain('{user}');

        const dismissed = (await t.http.post(`${url(storyId, chatId)}/dismiss`).expect(200)).body as RecapView;
        expect(dismissed).toEqual({ due: false, recap: expect.objectContaining({ text: RECAP, dismissed: true }) });
        // Asked for from the menu: the dismissed one, no new call.
        expect((await write(storyId, chatId)).recap?.text).toBe(RECAP);
        expect(t.gateway.textCalls('previously_on')).toHaveLength(1);

        // Its own kind, for the Usage page, served for this Chat.
        expect(call.kind).toBe('previously_on');
        expect(call.servedFor).toEqual({ storyId, chatId });
    });

    it('is never sent to the Narrator', async () => {
        const { storyId, chatId } = await createChat();
        await play(storyId, chatId);
        await away(chatId, 7);
        t.gateway.scriptText('previously_on', RECAP);
        await write(storyId, chatId);

        await play(storyId, chatId, 'I ask about the herd.');
        const turns = t.gateway.textCalls('turn');
        const last = turns.at(-1)!.messages.map((message) => message.content).join('\n');
        expect(last).not.toContain('Whether Ash can be trusted');
        for (const kind of ['judge', 'memory_extraction'] as const) {
            for (const other of t.gateway.textCalls(kind)) expect(other.messages.map((message) => message.content).join('\n')).not.toContain('Whether Ash can be trusted');
        }
        // A new Message: the old Recap no longer shows, and nothing is due until the next gap.
        expect(await read(storyId, chatId)).toEqual({ due: false, recap: null });
    });

    it('goes when its Message is regenerated, and when an edit takes it back', async () => {
        const { storyId, chatId } = await createChat();
        const chat = await play(storyId, chatId);
        await away(chatId, 7);
        t.gateway.scriptText('previously_on', RECAP);
        await write(storyId, chatId);

        // Again on the newest reply: same Message, new text.
        t.gateway.scriptText('turn', '@Nara: Gulp it, then.');
        t.gateway.scriptText('judge', JUDGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${chat.messages.at(-1)!.id}/regenerate`).send({}).expect(200);
        await settled(storyId, chatId);
        expect((await read(storyId, chatId)).recap).toBeNull();
        expect(await sql(`SELECT 1 FROM "chat_recap" WHERE "chat_id" = $1`, [chatId])).toHaveLength(0);

        // Written again, then the user's Message before it is edited: the reply it told of is gone.
        await away(chatId, 7);
        t.gateway.scriptText('previously_on', RECAP);
        expect((await write(storyId, chatId)).recap?.text).toBe(RECAP);
        const userMessage = chat.messages.find((message) => message.kind === 'user')!;
        t.gateway.scriptText('turn', '@Nara: Then go thirsty.');
        t.gateway.scriptText('judge', JUDGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}/messages/${userMessage.id}`).send({ text: 'I refuse the milk.' }).expect(200);
        await settled(storyId, chatId);
        expect(await sql(`SELECT 1 FROM "chat_recap" WHERE "chat_id" = $1`, [chatId])).toHaveLength(0);
        expect((await read(storyId, chatId)).recap).toBeNull();
    });

    it('stores nothing on a failed call, so the next ask writes it; a story-telling answer is asked for once more', async () => {
        const { storyId, chatId } = await createChat();
        await play(storyId, chatId);
        await away(chatId, 7);
        t.gateway.scriptText('previously_on', new ProviderOutageError('Down.'));

        const failed = await t.http.post(url(storyId, chatId)).expect(502);
        expect(failed.body.error.code).toBe('502.001.001');
        expect(await read(storyId, chatId)).toEqual({ due: true, recap: null });

        t.gateway.scriptText('previously_on', '[Nara]\nMore milk?', RECAP);
        expect((await write(storyId, chatId)).recap?.text).toBe(RECAP);
        expect(t.gateway.textCalls('previously_on')).toHaveLength(3);
    });

    it('shares one call between two asks at once', async () => {
        const { storyId, chatId } = await createChat();
        await play(storyId, chatId);
        await away(chatId, 7);
        t.gateway.scriptText('previously_on', RECAP);
        const [one, two] = await Promise.all([write(storyId, chatId), write(storyId, chatId)]);
        expect(one.recap?.text).toBe(RECAP);
        expect(two.recap?.text).toBe(RECAP);
        expect(t.gateway.textCalls('previously_on')).toHaveLength(1);
    });

    it('is due again after the next gap, once the story has moved on', async () => {
        const { storyId, chatId } = await createChat();
        await play(storyId, chatId);
        await away(chatId, 7);
        t.gateway.scriptText('previously_on', RECAP);
        await write(storyId, chatId);
        await t.http.post(`${url(storyId, chatId)}/dismiss`).expect(200);

        await play(storyId, chatId, 'I ask about the herd.');
        expect((await read(storyId, chatId)).due).toBe(false);
        await away(chatId, 30);
        expect(await read(storyId, chatId)).toEqual({ due: true, recap: null });
    });

    it('finds no Chat under another Story', async () => {
        const { chatId } = await createChat();
        const other = await createChat();
        await t.http.get(url(other.storyId, chatId)).expect(404);
    });
});

describe('"Previously on…" and the Monthly cap', () => {
    const SESSION_SECRET = 'y'.repeat(40);
    let t: TestApp;
    let accounts: AccountModelService;
    let usage: UsageRecordModelService;
    const cookie = (id: number) => `${SESSION_COOKIE}=${signSession(sessionKey(SESSION_SECRET), id, Date.now() + 24 * HOURS)}`;

    beforeAll(async () => {
        t = await startTestApp({ loginPassword: 'lantern-keeper-1890', sessionSecret: SESSION_SECRET, backgroundWaitMs: 300 });
        accounts = t.app.get(AccountModelService);
        usage = t.app.get(UsageRecordModelService);
    });

    afterAll(async () => {
        await t.close();
    });

    async function spend(account: AccountEntity, costUsd: number): Promise<void> {
        const record = { kind: 'turn', pool: 'text', model: 'm', host: 'h', promptTokens: 1, completionTokens: 1, images: null, costUsd, storyId: null, chatId: null, characters: null } as never;
        await requestScope.run({ account }, () => usage.record(record));
    }

    it("refuses a Member's Recap at their cap, with no call", async () => {
        const rin = await accounts.save({ email: 'rin-recap@example.com', role: AccountRole.Member, monthlyCapUsd: 0.5 });
        const as = cookie(rin.id);
        const { body: story } = await t.http.post('/api/stories').set('Cookie', as).send({ title: 'Capped' }).expect(201);
        await t.http.patch(`/api/stories/${story.id}`).set('Cookie', as).send({ setting: 'A camp.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${story.id}/role`).set('Cookie', as).send({ name: 'Ash', description: 'A trader.' }).expect(200);
        await t.http.post(`/api/stories/${story.id}/characters`).set('Cookie', as).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.' }).expect(201);
        const { body: chat } = await t.http.post(`/api/stories/${story.id}/chats`).set('Cookie', as).expect(201);
        t.gateway.scriptText('turn', '@Nara: Hm.');
        t.gateway.scriptText('judge', JUDGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).set('Cookie', as).send({ text: 'Hello.' }).expect(201);
        await spend(rin, 0.5);

        t.gateway.scriptText('previously_on', RECAP);
        const refused = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/recap`).set('Cookie', as).expect(402);
        expect(refused.body.error.code).toBe('402.010.009');
        expect(t.gateway.textCalls('previously_on')).toHaveLength(0);
    });
});

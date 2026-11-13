import pg from 'pg';

import { SESSION_COOKIE, sessionKey, signSession } from '../src/api/auth/session.js';
import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountEntity, AccountRole } from '../src/model/account/entities/account.entity.js';
import { requestScope } from '../src/model/account/request-scope.js';
import { UsageRecordModelService } from '../src/model/usage-record/usage-record.service.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/accounts/spec.md, ticket 04: "Monthly cap".
const SECRET = 'x'.repeat(40);
const DAY = 24 * 60 * 60 * 1000;
const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const CAP_REACHED = '402.010.009';

describe('Accounts: a Member\'s Monthly cap', () => {
    let t: TestApp;
    let accounts: AccountModelService;
    let usage: UsageRecordModelService;
    const cookie = (id: number) => `${SESSION_COOKIE}=${signSession(sessionKey(SECRET), id, Date.now() + 60 * DAY)}`;

    beforeAll(async () => {
        t = await startTestApp({ loginPassword: 'lantern-keeper-1890', sessionSecret: SECRET });
        accounts = t.app.get(AccountModelService);
        usage = t.app.get(UsageRecordModelService);
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function spend(account: AccountEntity, costUsd: number, kind = 'turn'): Promise<void> {
        const record = { kind, pool: 'text', model: 'm', host: 'h', promptTokens: 1, completionTokens: 1, images: null, costUsd, storyId: null, chatId: null, characters: null } as never;
        await requestScope.run({ account }, () => usage.record(record));
    }

    async function playableChat(as: string): Promise<{ storyId: number; chatId: number }> {
        const { body } = await t.http.post('/api/stories').set('Cookie', as).send({ title: 'Capped Tale' }).expect(201);
        await t.http.patch(`/api/stories/${body.id}`).set('Cookie', as).send({ setting: 'A lighthouse.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${body.id}/role`).set('Cookie', as).send({ name: 'Ash', description: 'The keeper.' }).expect(200);
        await t.http.post(`/api/stories/${body.id}/characters`).set('Cookie', as).send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' }).expect(201);
        const { body: chat } = await t.http.post(`/api/stories/${body.id}/chats`).set('Cookie', as).expect(201);
        return { storyId: body.id, chatId: chat.id };
    }

    async function messageCount(as: string, storyId: number, chatId: number): Promise<number> {
        return ((await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).set('Cookie', as).expect(200)).body.messages as unknown[]).length;
    }

    it('refuses a send, a suggestion and a Snapshot once the cap is reached, before anything is saved', async () => {
        const rin = await accounts.save({ email: 'rin@example.com', role: AccountRole.Member, monthlyCapUsd: 0.5 });
        const as = cookie(rin.id);
        const { storyId, chatId } = await playableChat(as);
        await spend(rin, 0.5);

        const before = await messageCount(as, storyId, chatId);
        const refused = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).set('Cookie', as).send({ text: 'Hello?' }).expect(402);
        expect(refused.body.error.code).toBe(CAP_REACHED);
        expect(refused.body.error.message).toMatch(/\$0\.50/);
        expect(await messageCount(as, storyId, chatId)).toBe(before);
        expect(t.gateway.textCalls('turn')).toHaveLength(0);

        const suggestions = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/suggestions`).set('Cookie', as).send({});
        expect(suggestions.body.error?.code).toBe(CAP_REACHED);
        const snapshot = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/snapshot-prompts`).set('Cookie', as).send({});
        expect(snapshot.body.error?.code).toBe(CAP_REACHED);
        expect(t.gateway.textCalls('suggested_replies')).toHaveLength(0);
        expect(t.gateway.textCalls('snapshot_prompt')).toHaveLength(0);
    });

    it("lets a turn already sent finish its background calls, even when it crosses the cap, and refuses the next send", async () => {
        const kai = await accounts.save({ email: 'kai@example.com', role: AccountRole.Member, monthlyCapUsd: 0.5 });
        const as = cookie(kai.id);
        const { storyId, chatId } = await playableChat(as);
        await spend(kai, 0.4);

        // The turn itself costs enough to reach the cap (a send without a stream asks completeText).
        const stream = t.gateway.streamText.bind(t.gateway);
        const complete = t.gateway.completeText.bind(t.gateway);
        t.gateway.streamText = async (request, options) => {
            if (request.kind === 'turn') await spend(kai, 0.2);
            return stream(request, options);
        };
        t.gateway.completeText = async (request) => {
            if (request.kind === 'turn') await spend(kai, 0.2);
            return complete(request);
        };
        try {
            t.gateway.scriptText('turn', '@Mira: Took you long enough.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', '{"operations":[]}');
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).set('Cookie', as).send({ text: 'Hello?' }).expect(201);
            await t.app.get(ChatManagerService).backgroundIdle(chatId);
        } finally {
            t.gateway.streamText = stream;
            t.gateway.completeText = complete;
        }
        expect(t.gateway.textCalls('judge')).toHaveLength(1);
        expect(t.gateway.textCalls('memory_extraction')).toHaveLength(1);
        const { body: chat } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).set('Cookie', as).expect(200);
        expect(chat.messages.at(-1).judge?.status).toBe('done');

        const next = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).set('Cookie', as).send({ text: 'Again?' });
        expect(next.status).toBe(402);
        expect(next.body.error.code).toBe(CAP_REACHED);
    });

    it('never caps the Owner, and counts only this month', async () => {
        const owner = cookie(accounts.owner.id);
        await spend(accounts.owner, 500);
        const { storyId, chatId } = await playableChat(owner);
        t.gateway.scriptText('turn', '@Mira: Fine.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).set('Cookie', owner).send({ text: 'Hello?' }).expect(201);
        await t.app.get(ChatManagerService).backgroundIdle(chatId);

        const mai = await accounts.save({ email: 'mai@example.com', role: AccountRole.Member, monthlyCapUsd: 1 });
        await spend(mai, 5);
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        // Last month's spend: the record moved to before the first of this month (UTC).
        await client.query(`UPDATE usage_record SET created_at = date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 day' WHERE user_id = $1`, [mai.id]);
        await client.end();
        const as = cookie(mai.id);
        const chat = await playableChat(as);
        t.gateway.scriptText('turn', '@Mira: Welcome back.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
        await t.http.post(`/api/stories/${chat.storyId}/chats/${chat.chatId}/messages`).set('Cookie', as).send({ text: 'Hello?' }).expect(201);
        await t.app.get(ChatManagerService).backgroundIdle(chat.chatId);
    });

    it("shows a Member only their own spend and cap, and never the provider's balance", async () => {
        const nao = await accounts.save({ email: 'nao@example.com', role: AccountRole.Member, monthlyCapUsd: 2 });
        await spend(nao, 0.25);
        await spend(nao, 0.5, 'snapshot_prompt');
        await spend(accounts.owner, 7);

        const { body } = await t.http.get('/api/usage').set('Cookie', cookie(nao.id)).expect(200);
        expect(body.pools.text.spentUsd).toBeCloseTo(0.75);
        expect(body.pools.text.remainingUsd).toBeNull();
        expect(body.pools.text.lowCredit).toBe(false);
        expect(body.pools.image.remainingUsd).toBeNull();
        expect(body.monthlyCap).toEqual({ capUsd: 2, spentUsd: 0.75, reached: false });

        const owner = await t.http.get('/api/usage').set('Cookie', cookie(accounts.owner.id)).expect(200);
        expect(owner.body.pools.text.spentUsd).toBeGreaterThan(7);
        expect(owner.body.monthlyCap).toBeNull();
    });
});

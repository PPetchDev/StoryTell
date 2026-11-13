import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

import { SESSION_COOKIE, sessionKey, signSession } from '../src/api/auth/session.js';
import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountRole } from '../src/model/account/entities/account.entity.js';
import { requestScope } from '../src/model/account/request-scope.js';
import { UsageRecordModelService } from '../src/model/usage-record/usage-record.service.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/accounts/spec.md, ticket 02: everything a person makes belongs to their Account.
const SECRET = 'x'.repeat(40);
const DAY = 24 * 60 * 60 * 1000;
const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

describe('Accounts: everything belongs to an Account', () => {
    let t: TestApp;
    let owner: string;
    let member: string;
    let memberId: number;

    beforeAll(async () => {
        t = await startTestApp({ loginPassword: 'lantern-keeper-1890', sessionSecret: SECRET });
        const accounts = t.app.get(AccountModelService);
        const rin = await accounts.save({ email: 'rin@example.com', role: AccountRole.Member, monthlyCapUsd: 5 });
        memberId = rin.id;
        const cookie = (id: number) => `${SESSION_COOKIE}=${signSession(sessionKey(SECRET), id, Date.now() + 60 * DAY)}`;
        owner = cookie(accounts.owner.id);
        member = cookie(rin.id);
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createStory(cookie: string, title: string): Promise<number> {
        const { body } = await t.http.post('/api/stories').set('Cookie', cookie).send({ title }).expect(201);
        await t.http.patch(`/api/stories/${body.id}`).set('Cookie', cookie).send({ setting: 'A lighthouse.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${body.id}/role`).set('Cookie', cookie).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${body.id}/characters`)
            .set('Cookie', cookie)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' })
            .expect(201);
        return body.id as number;
    }

    async function storyTitles(cookie: string): Promise<string[]> {
        const { body } = await t.http.get('/api/stories').set('Cookie', cookie).expect(200);
        return (body.stories as Array<{ title: string }>).map((story) => story.title);
    }

    it('lists each Account only its own Stories, and a duplicate belongs to whoever made it', async () => {
        const mine = await createStory(owner, 'Owner Tale');
        const theirs = await createStory(member, 'Member Tale');
        await t.http.post(`/api/stories/${theirs}/duplicate`).set('Cookie', member).send({}).expect(201);

        const ownerTitles = await storyTitles(owner);
        const memberTitles = await storyTitles(member);
        expect(ownerTitles).toContain('Owner Tale');
        expect(ownerTitles).not.toContain('Member Tale');
        expect(memberTitles).toContain('Member Tale');
        expect(memberTitles.filter((title) => title.startsWith('Member Tale'))).toHaveLength(2);
        expect(memberTitles).not.toContain('Owner Tale');

        // The other Account's Story answers as a missing one would, whatever the route.
        await t.http.get(`/api/stories/${mine}`).set('Cookie', member).expect(404);
        await t.http.patch(`/api/stories/${mine}`).set('Cookie', member).send({ title: 'Mine now' }).expect(404);
        await t.http.post(`/api/stories/${mine}/duplicate`).set('Cookie', member).send({}).expect(404);
        await t.http.post(`/api/stories/${mine}/chats`).set('Cookie', member).expect(404);
        await t.http.get(`/api/stories/${mine}/gallery`).set('Cookie', member).expect(404);
        await t.http.get(`/api/stories/${mine}/saved-replies`).set('Cookie', member).expect(404);
        await t.http.delete(`/api/stories/${mine}`).set('Cookie', member).expect(404);
        await t.http.get(`/api/stories/${mine}`).set('Cookie', owner).expect(200);
    });

    it("keeps a Chat out of reach of another Account, and a Chat can't wear another Account's Persona", async () => {
        const storyId = await createStory(owner, 'Owner Chat Tale');
        const { body: chat } = await t.http.post(`/api/stories/${storyId}/chats`).set('Cookie', owner).expect(201);
        await t.http.get(`/api/stories/${storyId}/chats/${chat.id}`).set('Cookie', member).expect(404);
        await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/memories`).set('Cookie', member).expect(404);

        const { body: persona } = await t.http.post('/api/personas').set('Cookie', owner).send({ name: 'Ash', description: 'The keeper.' }).expect(201);
        const memberStory = await createStory(member, 'Member Persona Tale');
        const { body: memberChat } = await t.http.post(`/api/stories/${memberStory}/chats`).set('Cookie', member).expect(201);
        const refused = await t.http.put(`/api/stories/${memberStory}/chats/${memberChat.id}/identity`).set('Cookie', member).send({ personaId: persona.id });
        expect(refused.status).toBe(404);
    });

    it('lists each Account only its own Personas, Saved replies and Replace rules', async () => {
        const { body: persona } = await t.http.post('/api/personas').set('Cookie', owner).send({ name: 'Owner Self', description: '' }).expect(201);
        await t.http.post('/api/personas').set('Cookie', member).send({ name: 'Member Self', description: '' }).expect(201);
        const memberPersonas = (await t.http.get('/api/personas').set('Cookie', member).expect(200)).body.personas as Array<{ name: string }>;
        expect(memberPersonas.map((entry) => entry.name)).toEqual(['Member Self']);
        await t.http.get(`/api/personas/${persona.id}`).set('Cookie', member).expect(404);
        await t.http.patch(`/api/personas/${persona.id}`).set('Cookie', member).send({ name: 'Taken' }).expect(404);
        await t.http.delete(`/api/personas/${persona.id}`).set('Cookie', member).expect(404);

        const saved = await t.http.post('/api/saved-replies').set('Cookie', owner).send({ text: 'owner line' }).expect(201);
        const ownerLine = (saved.body.savedReplies as Array<{ id: number; text: string }>).find((line) => line.text === 'owner line')!;
        await t.http.post('/api/saved-replies').set('Cookie', member).send({ text: 'member line' }).expect(201);
        const memberLines = (await t.http.get('/api/saved-replies').set('Cookie', member).expect(200)).body.savedReplies as Array<{ text: string }>;
        expect(memberLines.map((line) => line.text)).toEqual(['member line']);
        await t.http.patch(`/api/saved-replies/${ownerLine.id}`).set('Cookie', member).send({ text: 'taken' }).expect(404);
        await t.http.delete(`/api/saved-replies/${ownerLine.id}`).set('Cookie', member).expect(404);

        const rules = await t.http.post('/api/replace-rules').set('Cookie', owner).send({ find: 'owner find' }).expect(201);
        const ownerRule = (rules.body.replaceRules as Array<{ id: number; find: string }>).find((rule) => rule.find === 'owner find')!;
        await t.http.post('/api/replace-rules').set('Cookie', member).send({ find: 'member find' }).expect(201);
        const memberRules = (await t.http.get('/api/replace-rules').set('Cookie', member).expect(200)).body.replaceRules as Array<{ find: string }>;
        expect(memberRules.map((rule) => rule.find)).toEqual(['member find']);
        await t.http.patch(`/api/replace-rules/${ownerRule.id}`).set('Cookie', member).send({ find: 'taken' }).expect(404);
        await t.http.delete(`/api/replace-rules/${ownerRule.id}`).set('Cookie', member).expect(404);
    });

    it("serves a Story's images only to its Account", async () => {
        const storyId = await createStory(owner, 'Owner Picture Tale');
        const relative = `covers/story-${storyId}/cover-abcdef123456.png`;
        await mkdir(path.join(t.imageDir, `covers/story-${storyId}`), { recursive: true });
        await writeFile(path.join(t.imageDir, relative), PNG);

        await t.http.get(`/api/images/${relative}`).set('Cookie', owner).expect(200);
        await t.http.get(`/api/images/${relative}`).set('Cookie', member).expect(404);
    });

    it("runs a turn's background calls as the Account that sent it, and records usage for that Account", async () => {
        const accounts = t.app.get(AccountModelService);
        const seen: Array<[string, number]> = [];
        const complete = t.gateway.completeText.bind(t.gateway);
        const stream = t.gateway.streamText.bind(t.gateway);
        t.gateway.completeText = async (request) => {
            seen.push([request.kind, accounts.currentId()]);
            return complete(request);
        };
        t.gateway.streamText = async (request, options) => {
            seen.push([request.kind, accounts.currentId()]);
            return stream(request, options);
        };
        try {
            const storyId = await createStory(member, 'Member Usage Tale');
            const { body: chat } = await t.http.post(`/api/stories/${storyId}/chats`).set('Cookie', member).expect(201);
            t.gateway.scriptText('turn', '@Mira: Took you long enough.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', '{"operations":[]}');
            await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).set('Cookie', member).send({ text: 'Hello?' }).expect(201);
            await t.app.get(ChatManagerService).backgroundIdle(chat.id);
        } finally {
            t.gateway.completeText = complete;
            t.gateway.streamText = stream;
        }
        expect(seen.map(([kind]) => kind)).toEqual(expect.arrayContaining(['turn', 'judge', 'memory_extraction']));
        expect(new Set(seen.map(([, account]) => account))).toEqual(new Set([memberId]));

        // The gateway's record lands on the Account in scope; work outside any request is the Owner's.
        const usage = t.app.get(UsageRecordModelService);
        const record = { kind: 'judge', pool: 'text', model: 'm', host: 'h', promptTokens: 1, completionTokens: 1, images: null, costUsd: 0.001, storyId: null, chatId: null, characters: null } as never;
        await requestScope.run({ account: (await accounts.findById(memberId))! }, () => usage.record(record));
        await usage.record(record);
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        const { rows } = await client.query<{ user_id: number }>("SELECT user_id FROM usage_record WHERE model = 'm' ORDER BY id");
        await client.end();
        expect(rows.map((row) => row.user_id)).toEqual([memberId, accounts.owner.id]);
    });
});

import webpush from 'web-push';

import { SESSION_COOKIE, sessionKey, signSession } from '../src/api/auth/session.js';
import { ModelRefusalError } from '../src/errors/model-gateway.errors.js';
import { inQuietHours } from '../src/manager/chat/reach-out/reach-out.js';
import { PushAlertsManagerService } from '../src/manager/push/push-alerts.service.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountEntity, AccountRole } from '../src/model/account/entities/account.entity.js';
import { requestScope } from '../src/model/account/request-scope.js';
import { ReachOutModelService } from '../src/model/chat/reach-out.service.js';
import { TURN_CALL_KINDS, UsageRecordModelService } from '../src/model/usage-record/usage-record.service.js';
import { FakePushSender } from '../src/service/push/fake-push-sender.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/reach-outs/spec.md: Characters message first, through HTTP with the fake gateway and push sender.
const SECRET = 'x'.repeat(40);
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const VAPID = webpush.generateVAPIDKeys();
const REACH = 'A note slides under your door.\n\n@Mira: The lamp held all night. I kept wishing you had stayed to see it.';
const PHONE = { endpoint: 'https://fcm.googleapis.com/fcm/send/phone', keys: { p256dh: 'p256dh-phone', auth: 'auth-phone' } };

interface Part {
    kind: 'narration' | 'speech';
    speakerName?: string;
    characterId?: number | null;
    text: string;
}
interface Message {
    id: number;
    kind: 'user' | 'ai';
    parts?: Part[];
    reachOut?: boolean;
    judge?: { status: string } | null;
    memory?: { status: string } | null;
    versions?: { current: number; count: number } | null;
}
interface Chat {
    id: number;
    messages: Message[];
}

/** The first moment at or after `from` that is outside quiet hours, on the hour plus a minute. */
function daytime(from: number): Date {
    let at = new Date(from);
    while (inQuietHours(at)) at = new Date(at.getTime() + HOUR);
    return at;
}

describe('Reach-outs (HTTP)', () => {
    let t: TestApp;
    let push: FakePushSender;
    let alerts: PushAlertsManagerService;
    let accounts: AccountModelService;
    let owner: string;
    const cookie = (id: number) => `${SESSION_COOKIE}=${signSession(sessionKey(SECRET), id, Date.now() + 60 * DAY)}`;

    beforeAll(async () => {
        t = await startTestApp({
            loginPassword: 'lantern-keeper-1890',
            sessionSecret: SECRET,
            vapid: { publicKey: VAPID.publicKey, privateKey: VAPID.privateKey, subject: 'https://storytell.invalid' },
        });
        push = t.app.get(FakePushSender);
        alerts = t.app.get(PushAlertsManagerService);
        accounts = t.app.get(AccountModelService);
        owner = cookie(accounts.owner.id);
        await t.http.put('/api/push/subscription').set('Cookie', owner).send(PHONE).expect(204);
    });

    afterEach(async () => {
        await alerts.idle();
        push.reset();
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    const chatPath = (storyId: number, chatId: number) => `/api/stories/${storyId}/chats/${chatId}`;

    async function playableChat(as = owner): Promise<{ storyId: number; chatId: number; mira: number; kai: number }> {
        const { body } = await t.http.post('/api/stories').set('Cookie', as).send({ title: 'The Lighthouse' }).expect(201);
        await t.http.patch(`/api/stories/${body.id}`).set('Cookie', as).send({ setting: 'A lighthouse.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${body.id}/role`).set('Cookie', as).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const first = await t.http
            .post(`/api/stories/${body.id}/characters`)
            .set('Cookie', as)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.', secrets: 'She put the lamp out herself.' })
            .expect(201);
        const second = await t.http.post(`/api/stories/${body.id}/characters`).set('Cookie', as).send({ name: 'Kai', appearance: 'Wiry.', personality: 'Restless.', voice: 'Quick.' }).expect(201);
        const { body: chat } = await t.http.post(`/api/stories/${body.id}/chats`).set('Cookie', as).expect(201);
        return { storyId: body.id, chatId: chat.id, mira: first.body.characters[0].id, kai: second.body.characters[1].id };
    }

    async function settled(storyId: number, chatId: number, as = owner): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await t.http.get(chatPath(storyId, chatId)).set('Cookie', as).expect(200)).body as Chat;
            const last = chat.messages.at(-1)!;
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function play(storyId: number, chatId: number, text: string, judge = NO_CHANGE, as = owner): Promise<Chat> {
        t.gateway.scriptText('character_thought', 'I watch the keeper.', 'Fun.');
        t.gateway.scriptText('turn', { text: '@Mira: Fine.\n\n@Kai: Great!', model: 'glm-5.3' });
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`${chatPath(storyId, chatId)}/messages`).set('Cookie', as).send({ text }).expect(201);
        return settled(storyId, chatId, as);
    }

    async function tick(at: Date): Promise<Array<{ chatId: number; messageId: number }>> {
        const { body } = await t.http.post('/api/testing/reach-outs/tick').send({ now: at.toISOString() }).expect(200);
        await alerts.idle();
        return body.sent;
    }

    const setHours = (storyId: number, chatId: number, afterHours: number | null, as = owner) =>
        t.http.put(`${chatPath(storyId, chatId)}/reach-out`).set('Cookie', as).send({ afterHours });

    it('is off by default, takes 6, 12 or 24 hours or null, and refuses anything else or another Account\'s Chat', async () => {
        const { storyId, chatId } = await playableChat();
        expect((await t.http.get(`${chatPath(storyId, chatId)}/reach-out`).set('Cookie', owner).expect(200)).body).toEqual({ afterHours: null });
        expect((await setHours(storyId, chatId, 12).expect(200)).body).toEqual({ afterHours: 12 });
        expect((await t.http.get(`${chatPath(storyId, chatId)}/reach-out`).set('Cookie', owner).expect(200)).body).toEqual({ afterHours: 12 });
        for (const bad of [7, 0, '12', undefined]) expect((await setHours(storyId, chatId, bad as number).expect(400)).body.error.code).toBe('400.000.000');
        expect((await setHours(storyId, chatId, null).expect(200)).body).toEqual({ afterHours: null });

        const rin = await accounts.save({ email: 'rin-setting@example.com', role: AccountRole.Member, monthlyCapUsd: 5 });
        expect((await setHours(storyId, chatId, 6, cookie(rin.id)).expect(404)).body.error.code).toBe('404.003.001');
        const other = await playableChat();
        expect((await setHours(other.storyId, chatId === other.chatId ? chatId + 1 : chatId, 6).expect(404)).body.error.code).toBe('404.004.001');
        await t.http.delete(`/api/stories/${storyId}`).set('Cookie', owner).expect(204);
        await t.http.delete(`/api/stories/${other.storyId}`).set('Cookie', owner).expect(204);
    });

    it('sends one Reach-out once the time away is up: an AI Message, never judged, with its cost and an alert carrying the line', async () => {
        const { storyId, chatId, mira } = await playableChat();
        await play(storyId, chatId, 'I climb the stair.');
        await setHours(storyId, chatId, 24).expect(200);
        // The turn's own reply alert is not what this is about.
        await alerts.idle();
        push.reset();

        // Quiet hours can push a tick on by up to ten hours, so "too soon" is 13 hours into a 24-hour wait.
        expect(await tick(daytime(Date.now() + 13 * HOUR))).toEqual([]);
        expect(t.gateway.textCalls('reach_out')).toHaveLength(0);

        t.gateway.scriptText('reach_out', { text: REACH, model: 'deepseek-v4-flash', costUsd: 0.0004 });
        const sent = await tick(daytime(Date.now() + 25 * HOUR));
        expect(sent).toEqual([{ chatId, messageId: expect.any(Number) }]);

        const chat = (await t.http.get(chatPath(storyId, chatId)).set('Cookie', owner).expect(200)).body as Chat;
        const reached = chat.messages.at(-1)!;
        expect(reached).toMatchObject({ id: sent[0].messageId, kind: 'ai', reachOut: true, judge: null, memory: null, model: 'deepseek-v4-flash' });
        expect(reached.parts).toEqual([
            expect.objectContaining({ kind: 'narration', text: 'A note slides under your door.' }),
            expect.objectContaining({ kind: 'speech', characterId: mira, speakerName: 'Mira', text: 'The lamp held all night. I kept wishing you had stayed to see it.' }),
        ]);
        expect(chat.messages.slice(0, -1).every((message) => !message.reachOut)).toBe(true);

        // Who wrote it read their Thought, and never their Secrets.
        const [call] = t.gateway.textCalls('reach_out');
        const [system, user] = call.messages.map((message) => message.content);
        expect(system).toContain('The character is Mira.');
        expect(system).toContain("Mira's last private thought: I watch the keeper.");
        expect(system).not.toContain('She put the lamp out herself.');
        expect(user).toContain('Ash: I climb the stair.');
        expect(user).toContain('Ash has been away for');

        // The alert: who and what, opening the Chat.
        expect(push.sends.map((send) => send.payload)).toEqual([
            { title: 'Storytell', body: 'Mira: The lamp held all night. I kept wishing you had stayed to see it.', url: `/stories/${storyId}/chats/${chatId}`, tag: `chat-${chatId}` },
        ]);

        // Its cost is tied to it, as a reply's.
        // (The fake gateway records no usage; the real one's records of this kind are claimed for the Message like a turn's.)
        expect(TURN_CALL_KINDS).toContain('reach_out');

        // Never twice for one absence, however long the user stays away.
        expect(await tick(daytime(Date.now() + 60 * HOUR))).toEqual([]);
        expect(t.gateway.textCalls('reach_out')).toHaveLength(1);

        // The user answers: the Narrator reads the Reach-out, and a new absence can have its own.
        await play(storyId, chatId, 'I read the note twice.');
        const turn = t.gateway.textCalls('turn').at(-1)!;
        expect(turn.messages.map((message) => message.content).join('\n')).toContain('The lamp held all night.');
        t.gateway.scriptText('reach_out', { text: REACH, model: 'deepseek-v4-flash' });
        expect(await tick(daytime(Date.now() + 25 * HOUR))).toHaveLength(1);
        await t.http.delete(`/api/stories/${storyId}`).set('Cookie', owner).expect(204);
    });

    it('sends nothing while off, at night, before the user has written, while a reply is missing, after an Epilogue or an Ending', async () => {
        const quiet = await playableChat();
        await play(quiet.storyId, quiet.chatId, 'Hello.');
        // Off.
        expect(await tick(daytime(Date.now() + 30 * HOUR))).toEqual([]);
        // At night: 23:00 in Bangkok, a day on.
        await setHours(quiet.storyId, quiet.chatId, 6).expect(200);
        let night = new Date(Date.now() + 24 * HOUR);
        while (!inQuietHours(night)) night = new Date(night.getTime() + HOUR);
        expect(await tick(night)).toEqual([]);
        expect(t.gateway.textCalls('reach_out')).toHaveLength(0);
        await setHours(quiet.storyId, quiet.chatId, null).expect(200);

        // Never played: the Opening only.
        const fresh = await playableChat();
        await setHours(fresh.storyId, fresh.chatId, 6).expect(200);

        // A User Message whose reply failed.
        const failed = await playableChat();
        await setHours(failed.storyId, failed.chatId, 6).expect(200);
        t.gateway.scriptText('turn', new ModelRefusalError());
        await t.http.post(`${chatPath(failed.storyId, failed.chatId)}/messages`).set('Cookie', owner).send({ text: 'Anyone?' }).expect(422);

        // The Epilogue.
        const ended = await playableChat();
        await play(ended.storyId, ended.chatId, 'Goodbye, lamp.');
        t.gateway.scriptText('turn', { text: 'The lamp burned on for years.', model: 'glm-5.3' });
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`${chatPath(ended.storyId, ended.chatId)}/epilogue`).set('Cookie', owner).expect(200);
        await settled(ended.storyId, ended.chatId);
        await setHours(ended.storyId, ended.chatId, 6).expect(200);

        // An Ending the Judge suggested.
        const reached = await playableChat();
        await t.http.post(`/api/stories/${reached.storyId}/endings`).set('Cookie', owner).send({ name: 'The Departure', condition: 'Ash leaves the rock for good.' }).expect(201);
        await play(reached.storyId, reached.chatId, 'I leave the rock for good.', JSON.stringify({ ...JSON.parse(NO_CHANGE), ending: { reason: 'Ash left.', reached: 1 } }));
        await setHours(reached.storyId, reached.chatId, 6).expect(200);
        expect((await t.http.get(chatPath(reached.storyId, reached.chatId)).set('Cookie', owner).expect(200)).body.ending).toMatchObject({ name: 'The Departure' });

        expect(await tick(daytime(Date.now() + 30 * HOUR))).toEqual([]);
        expect(t.gateway.textCalls('reach_out')).toHaveLength(0);
        for (const story of [quiet, fresh, failed, ended, reached]) await t.http.delete(`/api/stories/${story.storyId}`).set('Cookie', owner).expect(204);
    });

    it("skips a Member over their Monthly cap and a disabled Account, and runs as the Story's own Account", async () => {
        const capped = await accounts.save({ email: 'capped@example.com', role: AccountRole.Member, monthlyCapUsd: 0.01 });
        const as = cookie(capped.id);
        const chat = await playableChat(as);
        await play(chat.storyId, chat.chatId, 'Hello.', NO_CHANGE, as);
        await setHours(chat.storyId, chat.chatId, 6, as).expect(200);
        const spend = (account: AccountEntity, costUsd: number) =>
            requestScope.run({ account }, () =>
                t.app.get(UsageRecordModelService).record({ kind: 'turn', pool: 'text', model: 'm', host: 'h', promptTokens: 1, completionTokens: 1, images: null, costUsd, storyId: null, chatId: null, characters: null } as never),
            );
        await spend(capped, 0.02);
        expect(await tick(daytime(Date.now() + 7 * HOUR))).toEqual([]);

        // Under a higher cap it goes, as that Member: their spend, their devices only (they have none).
        const raised = await accounts.save({ ...capped, monthlyCapUsd: 5 });
        t.gateway.scriptText('reach_out', { text: REACH, model: 'deepseek-v4-flash', costUsd: 0.001 });
        await accounts.save({ ...raised, disabled: true });
        expect(await tick(daytime(Date.now() + 7 * HOUR))).toEqual([]);
        await accounts.save({ ...raised, disabled: false });
        expect(await tick(daytime(Date.now() + 7 * HOUR))).toHaveLength(1);
        expect(push.sends).toEqual([]);
        expect(t.gateway.textCalls('reach_out')).toHaveLength(1);
        await t.http.delete(`/api/stories/${chat.storyId}`).set('Cookie', as).expect(204);
    });

    it('claims an absence once: a failed call is tried once more an hour later, then no more', async () => {
        const { storyId, chatId } = await playableChat();
        const chat = await play(storyId, chatId, 'Hello.');
        await setHours(storyId, chatId, 6).expect(200);
        const userMessageId = chat.messages.filter((message) => message.kind === 'user').at(-1)!.id;
        const start = daytime(Date.now() + 7 * HOUR);
        const later = (hours: number) => new Date(start.getTime() + hours * HOUR);

        t.gateway.scriptText('reach_out', new ModelRefusalError());
        expect(await tick(start)).toEqual([]);
        expect(await tick(later(0.5))).toEqual([]);
        expect(t.gateway.textCalls('reach_out')).toHaveLength(1);
        t.gateway.scriptText('reach_out', 'Nothing of hers here.');
        expect(await tick(later(1.1))).toEqual([]);
        expect(t.gateway.textCalls('reach_out')).toHaveLength(2);
        expect(await tick(later(5))).toEqual([]);
        expect(t.gateway.textCalls('reach_out')).toHaveLength(2);

        // The claim itself: one winner, whoever asks.
        const model = t.app.get(ReachOutModelService);
        const other = await playableChat();
        const played = await play(other.storyId, other.chatId, 'Hi.');
        await setHours(other.storyId, other.chatId, 6).expect(200);
        const id = played.messages.filter((message) => message.kind === 'user').at(-1)!.id;
        const results = await Promise.all([model.claim(other.chatId, id, start), model.claim(other.chatId, id, start)]);
        expect(results.sort()).toEqual([false, true]);
        expect(userMessageId).not.toBe(id);
        for (const story of [storyId, other.storyId]) await t.http.delete(`/api/stories/${story}`).set('Cookie', owner).expect(204);
    });

    it('Regenerate writes a Reach-out again from the same Character, as a Reply version, with no alert and no Judge', async () => {
        const { storyId, chatId, mira } = await playableChat();
        await play(storyId, chatId, 'Hello.');
        await setHours(storyId, chatId, 6).expect(200);
        t.gateway.scriptText('reach_out', { text: REACH, model: 'deepseek-v4-flash' });
        const [sent] = await tick(daytime(Date.now() + 7 * HOUR));
        push.reset();

        t.gateway.scriptText('reach_out', { text: 'A knock.\n\n@Mira: Are you awake?', model: 'deepseek-v4-flash' });
        const regenerated = await t.http.post(`${chatPath(storyId, chatId)}/messages/${sent.messageId}/regenerate`).set('Cookie', owner);
        expect(regenerated.body.error).toBeUndefined();
        const body = regenerated.body;
        const again = (body as Chat).messages.at(-1)!;
        expect(again).toMatchObject({ id: sent.messageId, reachOut: true, judge: null, memory: null, versions: { current: 2, count: 2 } });
        expect(again.parts!.at(-1)).toMatchObject({ characterId: mira, text: 'Are you awake?' });
        expect(t.gateway.textCalls('turn')).toHaveLength(1);
        expect(t.gateway.textCalls('judge')).toHaveLength(1);
        await alerts.idle();
        expect(push.sends).toEqual([]);

        // Choosing the first version back runs no Judge either.
        const chosen = await t.http.put(`${chatPath(storyId, chatId)}/messages/${sent.messageId}/version`).set('Cookie', owner).send({ version: 1 }).expect(200);
        expect((chosen.body as Chat).messages.at(-1)).toMatchObject({ reachOut: true, judge: null, memory: null });
        expect(t.gateway.textCalls('judge')).toHaveLength(1);

        // A Branch from it copies it as a Reach-out, and starts with the setting off.
        const { body: branch } = await t.http.post(`${chatPath(storyId, chatId)}/messages/${sent.messageId}/branch`).set('Cookie', owner).expect(201);
        expect((branch as Chat).messages.at(-1)).toMatchObject({ reachOut: true });
        expect((await t.http.get(`${chatPath(storyId, branch.id)}/reach-out`).set('Cookie', owner).expect(200)).body).toEqual({ afterHours: null });
        await t.http.delete(`/api/stories/${storyId}`).set('Cookie', owner).expect(204);
    });

    it('the warmest Character writes, never one sitting out', async () => {
        const { storyId, chatId, kai, mira } = await playableChat();
        const warmKai = JSON.stringify({
            bond_changes: [{ from: 'Kai', to: 'user', label: 'Devoted', description: 'Kai would follow Ash anywhere.', cause: 'The stair.', levels: { trust: 3, affection: 3, desire: 1, tension: 0 } }],
            arc_steps: [],
            scene: { move_on: false, reason: 'not yet' },
        });
        await play(storyId, chatId, 'I climb the stair.', warmKai);
        await setHours(storyId, chatId, 6).expect(200);
        t.gateway.scriptText('reach_out', { text: 'A shout from the yard.\n\n@Kai: Come down! I saved you a seat.', model: 'deepseek-v4-flash' });
        expect(await tick(daytime(Date.now() + 7 * HOUR))).toHaveLength(1);
        expect(t.gateway.textCalls('reach_out')[0].messages[0].content).toContain('How Kai feels about Ash now: "Devoted"');

        await play(storyId, chatId, 'I wave.');
        await t.http.put(`${chatPath(storyId, chatId)}/sitting-out`).set('Cookie', owner).send({ characterIds: [kai] }).expect(200);
        t.gateway.scriptText('reach_out', { text: REACH, model: 'deepseek-v4-flash' });
        expect(await tick(daytime(Date.now() + 7 * HOUR))).toHaveLength(1);
        expect(t.gateway.textCalls('reach_out')[1].messages[0].content).toContain('The character is Mira.');
        const chat = (await t.http.get(chatPath(storyId, chatId)).set('Cookie', owner).expect(200)).body as Chat;
        expect(chat.messages.at(-1)!.parts!.at(-1)).toMatchObject({ characterId: mira });
        await t.http.delete(`/api/stories/${storyId}`).set('Cookie', owner).expect(204);
    });
});

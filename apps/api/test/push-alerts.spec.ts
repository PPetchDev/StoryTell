import webpush from 'web-push';

import { SESSION_COOKIE, sessionKey, signSession } from '../src/api/auth/session.js';
import { ConfigError, loadConfig } from '../src/config/app-config.js';
import { ModelRefusalError } from '../src/errors/model-gateway.errors.js';
import { isKnownPushEndpoint, PushAlertsManagerService, replyAlertBody } from '../src/manager/push/push-alerts.service.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountRole } from '../src/model/account/entities/account.entity.js';
import { PushSubscriptionModelService } from '../src/model/push/push.service.js';
import { FakePushSender } from '../src/service/push/fake-push-sender.js';
import { WebPushSender } from '../src/service/push/web-push-sender.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/push-alerts/spec.md: reply alerts by Web Push.
const SECRET = 'x'.repeat(40);
const DAY = 24 * 60 * 60 * 1000;
const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const SECRET_LINE = 'the key is under the third stair';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const VAPID = webpush.generateVAPIDKeys();

function device(name: string) {
    return { endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` } };
}

describe('Reply alerts', () => {
    let t: TestApp;
    let push: FakePushSender;
    let alerts: PushAlertsManagerService;
    let subscriptions: PushSubscriptionModelService;
    let owner: string;
    let ownerId: number;
    let member: string;
    let memberId: number;

    beforeAll(async () => {
        t = await startTestApp({
            loginPassword: 'lantern-keeper-1890',
            sessionSecret: SECRET,
            vapid: { publicKey: VAPID.publicKey, privateKey: VAPID.privateKey, subject: 'https://storytell.invalid' },
        });
        push = t.app.get(FakePushSender);
        alerts = t.app.get(PushAlertsManagerService);
        subscriptions = t.app.get(PushSubscriptionModelService);
        const accounts = t.app.get(AccountModelService);
        const rin = await accounts.save({ email: 'rin@example.com', role: AccountRole.Member, monthlyCapUsd: 5 });
        const cookie = (id: number) => `${SESSION_COOKIE}=${signSession(sessionKey(SECRET), id, Date.now() + 60 * DAY)}`;
        ownerId = accounts.owner.id;
        memberId = rin.id;
        owner = cookie(ownerId);
        member = cookie(memberId);
    });

    afterEach(async () => {
        await alerts.idle();
        push.reset();
        t.gateway.reset();
        for (const id of [ownerId, memberId]) {
            for (const row of await subscriptions.findByAccount(id)) await subscriptions.remove(row.id);
        }
    });

    afterAll(async () => {
        await t.close();
    });

    async function subscribe(cookie: string, body: object, status = 204) {
        return t.http.put('/api/push/subscription').set('Cookie', cookie).send(body).expect(status);
    }

    async function endpointsOf(userId: number): Promise<string[]> {
        return (await subscriptions.findByAccount(userId)).map((row) => row.endpoint);
    }

    /** A Story with Mira and a fresh Chat on it, made as `cookie`'s Account. */
    async function createChat(cookie: string): Promise<{ storyId: number; chatId: number; title: string }> {
        const created = await t.http.post('/api/stories').set('Cookie', cookie).send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).set('Cookie', cookie).send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).set('Cookie', cookie).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .set('Cookie', cookie)
            .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
            .expect(201);
        const chat = await t.http.post(`/api/stories/${storyId}/chats`).set('Cookie', cookie).expect(201);
        return { storyId, chatId: chat.body.id as number, title: chat.body.title as string };
    }

    async function play(cookie: string, storyId: number, chatId: number, reply: string): Promise<void> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).set('Cookie', cookie).send({ text: 'I step inside.' }).expect(201);
        await alerts.idle();
    }

    it('gives the public key a browser subscribes with', async () => {
        const { body } = await t.http.get('/api/push').set('Cookie', owner).expect(200);
        expect(body).toEqual({ publicKey: VAPID.publicKey });
    });

    it('stores, re-stores and removes this device for the signed-in Account', async () => {
        await subscribe(owner, { ...device('phone'), expirationTime: null });
        await subscribe(owner, device('phone'));
        expect(await endpointsOf(ownerId)).toEqual([device('phone').endpoint]);
        const row = (await subscriptions.findByAccount(ownerId))[0];
        expect(row.p256dh).toBe('p256dh-phone');
        expect(row.auth).toBe('auth-phone');

        await t.http.delete('/api/push/subscription').set('Cookie', owner).send({ endpoint: device('phone').endpoint }).expect(204);
        expect(await endpointsOf(ownerId)).toEqual([]);
        // Removing one that isn't there is no error.
        await t.http.delete('/api/push/subscription').set('Cookie', owner).send({ endpoint: device('phone').endpoint }).expect(204);
    });

    it('moves a device to the Account that turned alerts on there last', async () => {
        await subscribe(owner, device('shared'));
        await subscribe(member, device('shared'));
        expect(await endpointsOf(ownerId)).toEqual([]);
        expect(await endpointsOf(memberId)).toEqual([device('shared').endpoint]);
        // Another Account can't remove it.
        await t.http.delete('/api/push/subscription').set('Cookie', owner).send({ endpoint: device('shared').endpoint }).expect(204);
        expect(await endpointsOf(memberId)).toEqual([device('shared').endpoint]);
    });

    it.each([
        ['an internal address', 'https://127.0.0.1/push'],
        ['plain http', 'http://fcm.googleapis.com/fcm/send/x'],
        ['a look-alike host', 'https://fcm.googleapis.com.evil.example/x'],
        ['another port', 'https://fcm.googleapis.com:8443/fcm/send/x'],
        ['not a URL', 'nonsense'],
    ])('refuses an endpoint on %s', async (_case, endpoint) => {
        const { body } = await subscribe(owner, { endpoint, keys: { p256dh: 'k', auth: 'a' } }, 422);
        expect(body.error.code).toBe('422.011.002');
        expect(await endpointsOf(ownerId)).toEqual([]);
    });

    it('knows the push services of Chrome, Firefox, Safari and Edge', () => {
        for (const endpoint of [
            'https://fcm.googleapis.com/fcm/send/abc',
            'https://updates.push.services.mozilla.com/wpush/v2/abc',
            'https://web.push.apple.com/abc',
            'https://wns2-par02p.notify.windows.com/w/?token=abc',
        ]) {
            expect(isKnownPushEndpoint(endpoint)).toBe(true);
        }
    });

    it('refuses a subscription without keys', async () => {
        await subscribe(owner, { endpoint: device('bare').endpoint }, 400);
    });

    it('alerts every device of the Account when a reply is stored, with no story text', async () => {
        await subscribe(owner, device('phone'));
        await subscribe(owner, device('laptop'));
        await subscribe(member, device('rins-phone'));
        const { storyId, chatId, title } = await createChat(owner);

        await play(owner, storyId, chatId, `A gust rattles the door.\n\n@Mira: Shut it. ${SECRET_LINE}.`);

        expect(push.sends.map((send) => send.endpoint).sort()).toEqual([device('laptop').endpoint, device('phone').endpoint]);
        for (const send of push.sends) {
            expect(send.payload).toEqual({
                title: 'Storytell',
                body: `Mira replied · ${title}`,
                url: `/stories/${storyId}/chats/${chatId}`,
                tag: `chat-${chatId}`,
            });
            expect(JSON.stringify(send.payload)).not.toContain('stair');
            expect(JSON.stringify(send.payload)).not.toContain('Lighthouse');
        }
    });

    it('says "New reply" for a reply of narration alone', async () => {
        await subscribe(owner, device('phone'));
        const { storyId, chatId, title } = await createChat(owner);
        await play(owner, storyId, chatId, 'The wind drops. Somewhere below, a door closes.');
        expect(push.sends.map((send) => send.payload.body)).toEqual([`New reply · ${title}`]);
    });

    it("alerts only the Account whose reply it is", async () => {
        await subscribe(owner, device('phone'));
        await subscribe(member, device('rins-phone'));
        const { storyId, chatId } = await createChat(member);
        await play(member, storyId, chatId, '@Mira: Come in.');
        expect(push.sends.map((send) => send.endpoint)).toEqual([device('rins-phone').endpoint]);
    });

    it('sends nothing for a failed turn', async () => {
        await subscribe(owner, device('phone'));
        const { storyId, chatId } = await createChat(owner);
        t.gateway.scriptText('turn', new ModelRefusalError('no'));
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).set('Cookie', owner).send({ text: 'I step inside.' }).expect(422);
        await alerts.idle();
        expect(push.sends).toEqual([]);
    });

    it('alerts when a Snapshot is stored', async () => {
        await subscribe(owner, device('phone'));
        const { storyId, chatId, title } = await createChat(owner);
        t.gateway.scriptText('snapshot_prompt', JSON.stringify({ in_frame: ['Mira'], scene: 'Mira at the window.' }));
        t.gateway.scriptImage('snapshot_image', { image: { bytes: Buffer.from('jpeg-bytes'), mimeType: 'image/jpeg' } });
        const written = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/snapshot-prompts`).set('Cookie', owner).send({}).expect(201);
        await t.http
            .post(`/api/stories/${storyId}/chats/${chatId}/snapshots`)
            .set('Cookie', owner)
            .send({ promptId: written.body.id, text: written.body.text })
            .expect(202);
        await vi.waitFor(async () => {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/snapshots`).set('Cookie', owner).expect(200);
            expect(body.jobs).toEqual([]);
            expect(body.snapshots).toHaveLength(1);
        });
        await alerts.idle();
        expect(push.sends.map((send) => send.payload)).toEqual([
            { title: 'Storytell', body: `Snapshot ready · ${title}`, url: `/stories/${storyId}/chats/${chatId}`, tag: `chat-${chatId}` },
        ]);
    });

    it.each([404, 410])('removes a subscription the push service answers %s for', async (status) => {
        await subscribe(owner, device('gone'));
        await subscribe(owner, device('phone'));
        push.answer(device('gone').endpoint, { kind: 'gone' });
        const { storyId, chatId } = await createChat(owner);
        await play(owner, storyId, chatId, `@Mira: ${status}.`);
        expect(await endpointsOf(ownerId)).toEqual([device('phone').endpoint]);
    });

    it('keeps a subscription after any other failure', async () => {
        await subscribe(owner, device('flaky'));
        push.answer(device('flaky').endpoint, { kind: 'failed', reason: 'push service answered 500' });
        const { storyId, chatId } = await createChat(owner);
        await play(owner, storyId, chatId, '@Mira: Again.');
        expect(push.sends).toHaveLength(1);
        expect(await endpointsOf(ownerId)).toEqual([device('flaky').endpoint]);
    });
});

describe('Reply alerts while the server has no keys', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    it('answers no key, refuses a subscription and sends nothing', async () => {
        expect((await t.http.get('/api/push').expect(200)).body).toEqual({ publicKey: null });
        const { body } = await t.http.put('/api/push/subscription').send(device('phone')).expect(404);
        expect(body.error.code).toBe('404.011.001');
        t.app.get(PushAlertsManagerService).replyReady({ storyId: 1, chatId: 1, chatTitle: 'Chat 1', speakerName: 'Mira' });
        await t.app.get(PushAlertsManagerService).idle();
        expect(t.app.get(FakePushSender).sends).toEqual([]);
    });
});

describe('Reply alerts: the alert line', () => {
    it('cuts a long Chat title', () => {
        const body = replyAlertBody('Mira', 'A'.repeat(300));
        expect(body).toHaveLength(120);
        expect(body.endsWith('…')).toBe(true);
    });
});

describe('Reply alerts: the Web Push sender', () => {
    const vapid = { publicKey: VAPID.publicKey, privateKey: VAPID.privateKey, subject: 'https://storytell.invalid' };
    const target = { endpoint: device('phone').endpoint, p256dh: 'k', auth: 'a' };
    const payload = { title: 'Storytell', body: 'Mira replied · Chat 1', url: '/stories/1/chats/1', tag: 'chat-1' };

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('signs with the VAPID pair, for an hour, at high urgency', async () => {
        const send = vi.spyOn(webpush, 'sendNotification').mockResolvedValue({ statusCode: 201, body: '', headers: {} });
        expect(await new WebPushSender(vapid).send(target, payload)).toEqual({ kind: 'sent' });
        expect(send).toHaveBeenCalledWith(
            { endpoint: target.endpoint, keys: { p256dh: 'k', auth: 'a' } },
            JSON.stringify(payload),
            expect.objectContaining({ vapidDetails: vapid, TTL: 3600, urgency: 'high' }),
        );
    });

    it.each([
        [404, 'gone'],
        [410, 'gone'],
        [500, 'failed'],
        [429, 'failed'],
    ])('reads a %s from the push service as %s', async (status, kind) => {
        vi.spyOn(webpush, 'sendNotification').mockRejectedValue(new webpush.WebPushError('no', status, {}, '', target.endpoint));
        expect((await new WebPushSender(vapid).send(target, payload)).kind).toBe(kind);
    });

    it('reads a network error as failed, never throwing', async () => {
        vi.spyOn(webpush, 'sendNotification').mockRejectedValue(new Error('ECONNRESET'));
        expect(await new WebPushSender(vapid).send(target, payload)).toEqual({ kind: 'failed', reason: 'ECONNRESET' });
    });
});

describe('Config: VAPID keys', () => {
    const base = { PORT: '4001', DATABASE_URL: 'postgres://localhost/test', IMAGE_DIR: '/data/storytell/images' };

    it('is off without keys', () => {
        expect(loadConfig(base).vapid).toBeUndefined();
    });

    it('takes both keys, with a default subject', () => {
        expect(loadConfig({ ...base, VAPID_PUBLIC_KEY: VAPID.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey }).vapid).toEqual({
            publicKey: VAPID.publicKey,
            privateKey: VAPID.privateKey,
            subject: 'https://storytell.invalid',
        });
        expect(
            loadConfig({ ...base, VAPID_PUBLIC_KEY: VAPID.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey, VAPID_SUBJECT: 'mailto:me@example.com' }).vapid
                ?.subject,
        ).toBe('mailto:me@example.com');
    });

    it.each([
        ['only the public key', { VAPID_PUBLIC_KEY: VAPID.publicKey }],
        ['only the private key', { VAPID_PRIVATE_KEY: VAPID.privateKey }],
        ['the keys swapped', { VAPID_PUBLIC_KEY: VAPID.privateKey, VAPID_PRIVATE_KEY: VAPID.publicKey }],
        ['a key that is not base64url', { VAPID_PUBLIC_KEY: `${VAPID.publicKey.slice(1)}+`, VAPID_PRIVATE_KEY: VAPID.privateKey }],
        ['a subject that is not mailto: or https:', { VAPID_PUBLIC_KEY: VAPID.publicKey, VAPID_PRIVATE_KEY: VAPID.privateKey, VAPID_SUBJECT: 'me@example.com' }],
    ])('refuses %s at start-up', (_case, env) => {
        expect(() => loadConfig({ ...base, ...env })).toThrow(ConfigError);
        expect(() => loadConfig({ ...base, ...env })).toThrow(/VAPID/);
    });
});

import { expect, Page, test } from '@playwright/test';
import { createECDH } from 'node:crypto';

import { startApi, stopApi } from './harness/api-server';

// .scratch/push-alerts/spec.md: reply alerts. Chromium here has no push service, so the browser's
// side (permission, PushManager) is stubbed in an init script; the API records alerts in its fake
// push sender, read at /api/testing/push.

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/e2e-phone';

/** A VAPID pair as `web-push generate-vapid-keys` prints it, made fresh for this run. */
function vapidKeys(): { publicKey: string; privateKey: string } {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const privateKey = Buffer.alloc(32);
    const raw = ecdh.getPrivateKey();
    raw.copy(privateKey, 32 - raw.length);
    return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: privateKey.toString('base64url') };
}

/**
 * Stands in for Chrome's push service. The permission answer comes from `localStorage['e2e-permission']`
 * ('granted' by default), and the subscription lives in `localStorage['e2e-subscription']`, so it
 * outlasts a reload as a real one does. The key the page subscribed with is kept for the test to read.
 */
async function stubPushService(page: Page): Promise<void> {
    await page.addInitScript((endpoint) => {
        let permission: NotificationPermission = (localStorage.getItem('e2e-permission-now') as NotificationPermission) ?? 'default';
        Object.defineProperty(Notification, 'permission', { get: () => permission, configurable: true });
        Notification.requestPermission = async () => {
            permission = (localStorage.getItem('e2e-permission') as NotificationPermission) ?? 'granted';
            localStorage.setItem('e2e-permission-now', permission);
            return permission;
        };
        const subscription = () =>
            ({
                endpoint,
                expirationTime: null,
                toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'e2e-p256dh', auth: 'e2e-auth' } }),
                unsubscribe: async () => {
                    localStorage.removeItem('e2e-subscription');
                    return true;
                },
            }) as unknown as PushSubscription;
        PushManager.prototype.getSubscription = async () => (localStorage.getItem('e2e-subscription') ? subscription() : null);
        PushManager.prototype.subscribe = async (options?: PushSubscriptionOptionsInit) => {
            const key = options?.applicationServerKey as Uint8Array;
            localStorage.setItem('e2e-subscription', btoa(String.fromCharCode(...key)));
            return subscription();
        };
    }, ENDPOINT);
}

interface Sent {
    endpoint: string;
    payload: { title: string; body: string; url: string; tag: string };
}

async function sentAlerts(page: Page): Promise<Sent[]> {
    return ((await (await page.request.get('/api/testing/push')).json()) as { sends: Sent[] }).sends;
}

/** A Story with Mira and a Chat, and one reply played through the API. */
async function playOneReply(page: Page): Promise<{ storyId: number; chatId: number; title: string }> {
    const { request } = page;
    const storyId = (await (await request.post('/api/stories', { data: { title: 'The Lighthouse' } })).json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: ['@Mira: Shut the door. The key is under the third stair.'] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    const chat = await (await request.post(`/api/stories/${storyId}/chats`)).json();
    const sent = await request.post(`/api/stories/${storyId}/chats/${chat.id}/messages`, { data: { text: 'I step inside.' } });
    expect(sent.ok()).toBe(true);
    return { storyId, chatId: chat.id as number, title: chat.title as string };
}

test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

test('without VAPID keys on the server, Settings shows no Alerts card', async ({ page }) => {
    await stubPushService(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Text size' })).toBeVisible();
    // The config has been asked for and answered null.
    await expect.poll(async () => (await (await page.request.get('/api/push')).json()).publicKey).toBeNull();
    await expect(page.getByRole('heading', { name: 'Alerts' })).toHaveCount(0);
});

test.describe('with VAPID keys', () => {
    const keys = vapidKeys();

    test.beforeAll(async () => {
        await stopApi();
        await startApi({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: 'https://storytell.invalid' });
    });

    test.afterAll(async () => {
        // Back to the plain API for the files after this one.
        await stopApi();
        await startApi();
    });

    test.beforeEach(async ({ page }) => {
        await page.request.delete('/api/testing/push');
        await stubPushService(page);
    });

    test('turning the switch on subscribes this device; a reply then alerts it; off stops that', async ({ page }) => {
        await page.goto('/settings');
        const card = page.locator('section.card', { has: page.getByRole('heading', { name: 'Alerts' }) });
        const alertSwitch = card.getByRole('switch', { name: /Alert me when a reply is ready/ });
        await expect(alertSwitch).toHaveAttribute('aria-checked', 'false');

        await alertSwitch.tap();
        await expect(alertSwitch).toHaveAttribute('aria-checked', 'true');
        await expect(alertSwitch).toHaveText('On');
        // It subscribed with the server's public key.
        const usedKey = await page.evaluate(() => localStorage.getItem('e2e-subscription'));
        expect(Buffer.from(usedKey!, 'base64').toString('base64url')).toBe(keys.publicKey);

        // A reply alerts this device, with no story text.
        const { storyId, chatId, title } = await playOneReply(page);
        await expect.poll(() => sentAlerts(page)).toHaveLength(1);
        const [alert] = await sentAlerts(page);
        expect(alert).toEqual({
            endpoint: ENDPOINT,
            payload: { title: 'Storytell', body: `Mira replied · ${title}`, url: `/stories/${storyId}/chats/${chatId}`, tag: `chat-${chatId}` },
            outcome: 'sent',
        });
        expect(JSON.stringify(alert)).not.toContain('stair');

        // Still on after a reload.
        await page.reload();
        await expect(alertSwitch).toHaveAttribute('aria-checked', 'true');

        // The card fits a 360px and a 320px phone.
        for (const width of [360, 320]) {
            await page.setViewportSize({ width, height: 780 });
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
            const box = (await alertSwitch.boundingBox())!;
            expect(box.x + box.width).toBeLessThanOrEqual(width);
            expect(box.height).toBeGreaterThanOrEqual(44);
        }

        await alertSwitch.tap();
        await expect(alertSwitch).toHaveAttribute('aria-checked', 'false');
        expect(await page.evaluate(() => localStorage.getItem('e2e-subscription'))).toBeNull();
        await page.request.delete('/api/testing/push');
        await playOneReply(page);
        // The turn's alert would have been sent by now; none was.
        await page.waitForTimeout(500);
        expect(await sentAlerts(page)).toEqual([]);
        await page.request.delete(`/api/stories/${storyId}`);
    });

    test('blocked notifications keep the switch off and say where to allow them', async ({ page }) => {
        await page.addInitScript(() => localStorage.setItem('e2e-permission', 'denied'));
        await page.goto('/settings');
        const alertSwitch = page.getByRole('switch', { name: /Alert me when a reply is ready/ });
        await alertSwitch.tap();
        const card = page.locator('section.card', { has: page.getByRole('heading', { name: 'Alerts' }) });
        await expect(card.getByRole('alert')).toContainText("Allow them in Chrome's site settings");
        await expect(alertSwitch).toHaveAttribute('aria-checked', 'false');
        expect(await page.evaluate(() => localStorage.getItem('e2e-subscription'))).toBeNull();
    });

    test('the service worker shows a pushed alert only while no window of the app is visible', async ({ page, context }) => {
        await page.goto('/settings');
        await page.evaluate(() => navigator.serviceWorker.ready);
        const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
        // The worker's own push handler, given a push as Chrome hands it over. Headless Chromium never
        // grants a worker notification permission, so `showNotification` is caught and its call answered.
        const push = (tag: string) =>
            worker.evaluate(async (wanted) => {
                const scope = self as unknown as {
                    showAlert(event: { data: { json(): unknown } }): Promise<void>;
                    registration: { showNotification(title: string, options: NotificationOptions): Promise<void> };
                };
                const shown: Array<{ title: string; body?: string; tag?: string; url?: string }> = [];
                scope.registration.showNotification = async (title, options) => {
                    shown.push({ title, body: options.body, tag: options.tag, url: (options.data as { url?: string } | undefined)?.url });
                };
                await scope.showAlert({ data: { json: () => ({ title: 'Storytell', body: 'Mira replied · Chat 1', url: 'https://elsewhere.example/x', tag: wanted }) } });
                return shown;
            }, tag);

        // A window of the app is visible: nothing shows.
        expect(await push('chat-visible')).toEqual([]);

        // No window of the app (it was closed, or Android put it away): the alert shows, and opens only a path of this app.
        const blank = await context.newPage();
        await page.close();
        expect(await push('chat-hidden')).toEqual([{ title: 'Storytell', body: 'Mira replied · Chat 1', tag: 'chat-hidden', url: '/' }]);
        await blank.close();
    });
});

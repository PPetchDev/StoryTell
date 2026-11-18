import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { createECDH } from 'node:crypto';

import { startApi, stopApi } from './harness/api-server';

// .scratch/reach-outs/spec.md: Characters message first. The Chat menu's choice, a scheduler tick
// on the testing route as if hours had passed, the Reach-out in the thread, and its alert recorded
// by the fake push sender. On a phone, at 360 and 320 px.

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/e2e-reach-out';
const LINE = 'The lamp held all night. I kept wishing you had stayed to see it.';
const HOUR = 60 * 60 * 1000;

/** A VAPID pair, made fresh for this run, so the API sends alerts. */
function vapidKeys(): { publicKey: string; privateKey: string } {
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const privateKey = Buffer.alloc(32);
    const raw = ecdh.getPrivateKey();
    raw.copy(privateKey, 32 - raw.length);
    return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: privateKey.toString('base64url') };
}

/** The first hour at or after `from` outside quiet hours (22:00 to 08:00 in Bangkok). */
function daytime(from: number): Date {
    const hourIn = (at: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: 'numeric', hourCycle: 'h23' }).format(at)) % 24;
    let at = new Date(from);
    while (hourIn(at) >= 22 || hourIn(at) < 8) at = new Date(at.getTime() + HOUR);
    return at;
}

/** A Story with Mira and Kai and a Chat with one reply played, through the API. */
async function playedChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const storyId = (await (await request.post('/api/stories', { data: { title: 'The Lighthouse' } })).json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    for (const [name, personality] of [
        ['Mira', 'Guarded and dry.'],
        ['Kai', 'Restless.'],
    ]) {
        await request.post(`/api/stories/${storyId}/characters`, { data: { name, appearance: 'Tall.', personality, voice: 'Short sentences.' } });
    }
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'character_thought', replies: ['I watch the new keeper.'] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: '@Mira: Shut the door behind you.', model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I step inside.' } })).ok()).toBe(true);
    await expect
        .poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1).memory?.status, { timeout: 10_000 })
        .toBe('done');
    return { storyId, chatId };
}

async function noSideScroll(page: Page, width: number): Promise<void> {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

test.describe('Characters message first', () => {
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

    test('the Chat menu turns it on; away long enough, Mira messages first, in the thread and as an alert', async ({ page, request }) => {
        const { storyId, chatId } = await playedChat(request);
        try {
            await request.delete('/api/testing/push');
            expect((await request.put('/api/push/subscription', { data: { endpoint: ENDPOINT, keys: { p256dh: 'e2e-p256dh', auth: 'e2e-auth' } } })).status()).toBe(204);

            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Shut the door behind you.');

            // Off by default; the menu row says so and opens the choices.
            await page.getByRole('button', { name: 'Chat menu' }).tap();
            const menu = page.getByRole('dialog', { name: 'Chat menu' });
            const row = menu.getByRole('button', { name: /Characters message first/ });
            await expect(row).toContainText('Off');
            await row.tap();
            const sheet = page.getByRole('dialog', { name: 'Characters message first' });
            const choices = sheet.getByRole('radiogroup', { name: 'Characters message first' });
            await expect(choices.getByRole('radio', { name: 'Off' })).toBeChecked();
            await expect(sheet).toContainText('Never from 22:00 to 08:00.');

            // The choices fit a 360px and a 320px phone, each a 44px target.
            for (const width of [360, 320]) {
                await page.setViewportSize({ width, height: 780 });
                await noSideScroll(page, width);
                for (const label of ['Off', 'After 6 hours', 'After 12 hours', 'After 24 hours']) {
                    const box = (await sheet.locator('label', { hasText: label }).boundingBox())!;
                    expect(box.height).toBeGreaterThanOrEqual(44);
                    expect(box.x + box.width).toBeLessThanOrEqual(width);
                }
            }
            await page.setViewportSize({ width: 360, height: 780 });

            await sheet.getByText('After 6 hours').tap();
            await expect(choices.getByRole('radio', { name: 'After 6 hours' })).toBeChecked();
            await expect.poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}/reach-out`)).json()).afterHours).toBe(6);
            await sheet.getByRole('button', { name: 'Done' }).tap();
            await expect(page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /Characters message first/ })).toContainText('After 6 hours away');
            await page.keyboard.press('Escape');

            // Seven hours on, by day: the scheduler's tick sends one.
            await request.post('/api/testing/fake-gateway/text', {
                data: { kind: 'reach_out', replies: [{ text: `A note slides under your door.\n\n@Mira: ${LINE}`, model: 'deepseek-v4-flash' }] },
            });
            const ticked = await (await request.post('/api/testing/reach-outs/tick', { data: { now: daytime(Date.now() + 7 * HOUR).toISOString() } })).json();
            expect(ticked.sent).toHaveLength(1);

            // In the thread, with who wrote it.
            await page.reload();
            const reached = page.getByRole('article', { name: 'AI reply' }).last();
            await expect(reached).toContainText(LINE);
            await expect(reached).toContainText('A note slides under your door.');
            await expect(reached.locator('[data-reach-out-label]')).toHaveText('Mira messaged you while you were away');
            for (const width of [360, 320]) {
                await page.setViewportSize({ width, height: 780 });
                await noSideScroll(page, width);
                const box = (await reached.locator('[data-reach-out-label]').boundingBox())!;
                expect(box.x + box.width).toBeLessThanOrEqual(width);
            }

            // And as an alert on the device: who and what, opening the Chat.
            await expect
                .poll(async () => ((await (await request.get('/api/testing/push')).json()) as { sends: Array<{ payload: { body: string } }> }).sends.map((send) => send.payload.body))
                .toContain(`Mira: ${LINE}`);
            const sends = ((await (await request.get('/api/testing/push')).json()) as { sends: Array<{ payload: { body: string; url: string } }> }).sends;
            expect(sends.find((send) => send.payload.body.startsWith('Mira: '))!.payload.url).toBe(`/stories/${storyId}/chats/${chatId}`);

            // Never a second for the same absence.
            const again = await (await request.post('/api/testing/reach-outs/tick', { data: { now: daytime(Date.now() + 30 * HOUR).toISOString() } })).json();
            expect(again.sent).toEqual([]);
        } finally {
            await request.delete('/api/push/subscription', { data: { endpoint: ENDPOINT } });
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

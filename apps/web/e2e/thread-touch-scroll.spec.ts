import { APIRequestContext, CDPSession, expect, Locator, Page, test } from '@playwright/test';

// The user's phone, 360px wide. After a composer change the thread could not be dragged up at all
// (2026-11-16): it follows its end while it changes size, and it was changing size under the
// finger, so every drag was undone before it had moved the 48px that counted as leaving the end.
// The thread never moves under a finger now. The drags here are raw touch events, as a finger makes.
test.use({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2.75 });

const NO_OPS = '{"operations":[]}';
const NO_CHANGE = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'nothing yet' } });

async function createLongChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Herd', setting: 'A summer road.', opening: 'Dust on the road.\n\n@Nara: How much money?' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Petch', description: 'A traveller.' } });
    for (const name of ['Nara', 'Dulcie']) {
        await request.post(`/api/stories/${storyId}/characters`, { data: { name, appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.' } });
    }
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    for (let n = 1; n <= 6; n++) {
        const reply = `The road goes on, mile ${n}.\n\n@Nara: Reply ${n}, and a long one so the thread is tall enough to scroll a good way.\n\n@Dulcie: Shoo.`;
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
        await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: `Turn ${n}.` } });
        await expect
            .poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1).judge?.status, { timeout: 10_000 })
            .toBe('done');
    }
    return { storyId, chatId };
}

const fromEnd = (thread: Locator) => thread.evaluate((el) => Math.round(el.scrollHeight - el.scrollTop - el.clientHeight));

/** Makes the composer a pixel taller or shorter, which makes the thread above it a pixel shorter or taller. */
const nudgeComposer = (page: Page, taller: boolean) =>
    page.evaluate((odd) => ((document.querySelector('footer') as HTMLElement).style.paddingTop = odd ? '9px' : '8px'), taller);

/** One finger down at `y`, moved by `distance` (down the screen when positive), and lifted. With `resizing`, the thread changes size at every step. */
async function drag(session: CDPSession, page: Page, distance: number, resizing: boolean, y = 250) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y }] });
    const steps = Math.max(6, Math.round(Math.abs(distance) / 5));
    for (let step = 1; step <= steps; step++) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: y + (distance * step) / steps }] });
        if (resizing) await nudgeComposer(page, step % 2 === 1);
        await page.waitForTimeout(20);
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
}

test('a finger drags the thread up even while the thread changes size under it, and the thread follows its end again once dragged back there', async ({ page, request }) => {
    const { storyId, chatId } = await createLongChat(request);
    await request.delete('/api/testing/fake-gateway');
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const thread = page.getByRole('region', { name: 'Messages' });
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Reply 6');
        // It opens at its end, and stays there while its size changes with nobody touching it.
        await expect.poll(() => fromEnd(thread)).toBeLessThanOrEqual(1);
        await nudgeComposer(page, true);
        await nudgeComposer(page, false);
        await expect.poll(() => fromEnd(thread)).toBeLessThanOrEqual(1);

        const session = await page.context().newCDPSession(page);
        // A short drag, well inside the 48px that used to count as "still at the end".
        await drag(session, page, 40, true);
        const short = await fromEnd(thread);
        expect(short).toBeGreaterThan(10);
        // It stays where the finger left it, whatever changes size after.
        await nudgeComposer(page, true);
        await page.waitForTimeout(200);
        expect(await fromEnd(thread)).toBeGreaterThan(10);

        // A long drag goes a long way.
        await drag(session, page, 300, true);
        expect(await fromEnd(thread)).toBeGreaterThan(short + 150);

        // Dragged back to the end, the thread follows it again: a change of size keeps the newest Message in view.
        await drag(session, page, -500, false, 500);
        await drag(session, page, -500, false, 500);
        await expect.poll(() => fromEnd(thread)).toBeLessThanOrEqual(4);
        await page.waitForTimeout(1_600);
        await page.evaluate(() => ((document.querySelector('footer') as HTMLElement).style.paddingTop = '40px'));
        await expect.poll(() => fromEnd(thread)).toBeLessThanOrEqual(1);
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toBeInViewport();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

import { expect, Locator, Page, test } from '@playwright/test';

// Reply versions (.scratch/swipe/spec.md) are a phone gesture: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const CURIOUS = JSON.stringify({
    bond_changes: [{ from: 'Mira', to: 'user', label: 'Curious', description: 'Curious, in a word.', cause: 'Ash came in.' }],
    arc_steps: [],
    scene: { move_on: false, reason: 'not yet' },
});

/** A one-finger swipe across the middle of `target`, by `dx` sideways. */
async function swipe(page: Page, target: Locator, dx: number): Promise<void> {
    const box = await target.boundingBox();
    if (!box) throw new Error('Nothing to swipe on');
    const start = { x: box.x + box.width / 2, y: box.y + Math.min(box.height / 2, 40) };
    const cdp = await page.context().newCDPSession(page);
    const steps = 8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= steps; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (dx * step) / steps, y: start.y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
}

test('↺ Again keeps the old reply: ‹ n/m › and a swipe move between the versions, and a send settles on the shown one', async ({ page, request }) => {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: {
            kind: 'turn',
            replies: [
                { text: '@Mira: You took your time.', model: 'glm-5.3' },
                { text: 'Mira only points at the stairs.', model: 'glm-5.3' },
                { text: '@Mira: Tea is in the tin.', model: 'glm-5.3' },
            ],
        },
    });
    // The first reply, the second (which makes Mira curious), choosing 1, swiping back to 2, and the send.
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE, CURIOUS, NO_CHANGE, CURIOUS, NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS, NO_OPS, NO_OPS, NO_OPS, NO_OPS] } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const actions = page.getByRole('group', { name: 'Message actions' });
        const versions = page.getByRole('group', { name: 'Reply versions' });
        const reply = page.getByRole('article', { name: 'AI reply' });
        const articles = page.getByRole('region', { name: 'Messages' }).getByRole('article');
        const composer = page.getByRole('form', { name: 'Composer' });

        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('I take my boots off.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(reply).toContainText('You took your time.');
        // One version: no ‹ n/m ›.
        await expect(actions.getByRole('button', { name: 'Again' })).toBeVisible();
        await expect(versions).toHaveCount(0);

        await actions.getByRole('button', { name: 'Again' }).tap();
        await expect(reply).toContainText('Mira only points at the stairs.');
        await expect(versions.getByLabel('Version 2 of 2')).toHaveText('2/2');
        await expect(versions.getByRole('button', { name: 'Next version' })).toBeDisabled();
        // ‹ n/m › leads the row.
        await expect(actions.getByRole('button').first()).toHaveAccessibleName('Previous version');

        // ‹ brings the first reply back, and undoes what the second changed.
        await versions.getByRole('button', { name: 'Previous version' }).tap();
        await expect(reply).toContainText('You took your time.');
        await expect(page.getByText('Mira only points at the stairs.')).toHaveCount(0);
        await expect(versions.getByLabel('Version 1 of 2')).toHaveText('1/2');
        await expect(page.getByRole('status').filter({ hasText: 'Rolled back: 1 Bond change.' })).toBeVisible();
        await expect(articles).toHaveCount(3);

        // A swipe left shows the next version; a swipe right past the first does nothing.
        await swipe(page, reply.getByRole('paragraph').first(), -180);
        await expect(reply).toContainText('Mira only points at the stairs.');
        await expect(versions.getByLabel('Version 2 of 2')).toBeVisible();
        await swipe(page, reply.getByRole('paragraph').first(), 180);
        await expect(reply).toContainText('You took your time.');
        await expect(versions.getByLabel('Version 1 of 2')).toBeVisible();
        await swipe(page, reply.getByRole('paragraph').first(), 180);
        await expect(versions.getByLabel('Version 1 of 2')).toBeVisible();

        // The page never scrolls sideways at phone width.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

        // The version stays chosen after a reload, and a send settles on it.
        await page.reload();
        await expect(reply).toContainText('You took your time.');
        await expect(versions.getByLabel('Version 1 of 2')).toBeVisible();
        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('Is there tea?');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(reply.last()).toContainText('Tea is in the tin.');
        await expect(versions).toHaveCount(0);
        await expect(articles).toHaveCount(5);
        await expect(articles.nth(2)).toContainText('You took your time.');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

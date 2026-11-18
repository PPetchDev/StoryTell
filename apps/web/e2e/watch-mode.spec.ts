import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Watch mode (.scratch/watch-mode/spec.md), on a phone: the story plays on by itself for a few
// replies, run by the API, with progress and Stop over the composer.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const NO_OPS = '{"operations":[]}';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"not yet"}}';

const reply = (n: number) => `Rain lashes the glass.\n\n@Mira: Number ${n}, Tomas. Trim the wick.\n\n@Tomas: Again? Fine.`;

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Watch', setting: 'A lighthouse, 1890s.', opening: '@Mira: The lamp went out an hour ago.' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Tomas', appearance: 'Short.', personality: 'Lazy.', voice: 'Grumbles.' } });
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    // Each reply makes exactly its turn, Judge and Memory calls.
    await request.patch(`/api/stories/${storyId}/chats/${chatId}`, { data: { characterThoughts: false, autoDiary: false } });
    return { storyId, chatId };
}

/** Scripts `count` replies, each with its Judge and Memory; `slow` streams them so a test can act mid-reply. */
async function scriptReplies(request: APIRequestContext, count: number, slow = false, from = 1): Promise<void> {
    const numbers = Array.from({ length: count }, (_, index) => from + index);
    await request.post(`${FAKE}/text`, {
        data: { kind: 'turn', replies: numbers.map((n) => ({ text: reply(n), model: 'glm-5.3', ...(slow ? { pieceSize: 3, pieceDelayMs: 60 } : {}) })) },
    });
    await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: numbers.map(() => NO_CHANGE) } });
    await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: numbers.map(() => NO_OPS) } });
}

/** Opens ⋯ and the Watch sheet. */
async function openWatch(page: Page) {
    await page.getByRole('button', { name: 'Chat menu' }).tap();
    await page.getByRole('button', { name: /Watch the story/ }).tap();
    const sheet = page.getByRole('dialog', { name: 'Watch the story' });
    await expect(sheet).toBeVisible();
    return sheet;
}

const noSidewaysScroll = async (page: Page, width: number) =>
    expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

test('Watch 3 from the Chat menu: the cost first, then three replies with the count, and how it ended', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete(FAKE);
    await scriptReplies(request, 3);
    // The fake gateway records no usage: the estimate is the API's answer, as tested in apps/api/test/watch-mode.spec.ts.
    await page.route(`**/api/stories/${storyId}/chats/${chatId}/watch`, async (route) => {
        const accept = route.request().headers()['accept'] ?? '';
        if (route.request().method() !== 'GET' || accept.includes('text/event-stream')) return route.continue();
        const response = await route.fetch();
        return route.fulfill({ response, json: { ...(await response.json()), perReplyUsd: 0.0123 } });
    });
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const sheet = await openWatch(page);
        await expect(sheet.getByText('Ash stays in the background')).toBeVisible();
        // 5 is chosen first; the cost follows the choice.
        await expect(sheet.getByRole('radio', { name: '5 replies' })).toBeChecked();
        await expect(sheet.getByText('About $0.0123 a reply · about $0.0615 for 5')).toBeVisible();
        await sheet.getByText('3', { exact: true }).tap();
        await expect(sheet.getByRole('radio', { name: '3 replies' })).toBeChecked();
        await expect(sheet.getByText('About $0.0123 a reply · about $0.0369 for 3')).toBeVisible();
        await sheet.getByRole('button', { name: 'Start watching' }).tap();
        await expect(sheet).toBeHidden();

        const aiReplies = page.getByRole('article', { name: 'AI reply' });
        await expect(aiReplies).toHaveCount(3);
        for (const [index, n] of [1, 2, 3].entries()) await expect(aiReplies.nth(index)).toContainText(`Number ${n}, Tomas.`);
        const ended = page.locator('[data-band="watch-ended"]');
        await expect(ended).toContainText('Watched 3 replies.');
        // No line was written for the user.
        await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(0);
        // Each was a Continue with the watch instruction.
        const { calls } = (await (await request.get(`${FAKE}/calls`)).json()) as { calls: Array<{ method: string; request?: { kind?: string; messages?: Array<{ content: string }> } }> };
        const turns = calls.filter((call) => call.request?.kind === 'turn');
        expect(turns).toHaveLength(3);
        for (const turn of turns) expect(turn.request?.messages?.at(-1)?.content).toContain('Ash stays in the background this turn');

        // Closed, it doesn't come back.
        await ended.getByRole('button', { name: 'Close' }).tap();
        await expect(ended).toBeHidden();
        await page.reload();
        await expect(aiReplies).toHaveCount(3);
        await expect(page.locator('[data-band^="watch"]')).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('Stop mid-reply keeps the replies before it and writes no more', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete(FAKE);
    await scriptReplies(request, 3, true);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const sheet = await openWatch(page);
        await sheet.getByText('3', { exact: true }).tap();
        await sheet.getByRole('button', { name: 'Start watching' }).tap();

        const band = page.locator('[data-band="watch"]');
        await expect(band).toContainText('Watching · 1 of 3');
        const aiReplies = page.getByRole('article', { name: 'AI reply' });
        await expect(aiReplies).toHaveCount(1);
        await expect(band).toContainText('Watching · 2 of 3');
        // The second reply shows as it is written.
        await expect(page.getByText('Rain lashes').nth(1)).toBeVisible();
        await band.getByRole('button', { name: 'Stop' }).tap();

        await expect(band).toBeHidden();
        await expect(aiReplies).toHaveCount(1);
        await expect(page.getByText('Number 2, Tomas.')).toHaveCount(0);
        // Nothing more comes, and the stored Chat agrees.
        await page.waitForTimeout(1_500);
        await expect(aiReplies).toHaveCount(1);
        const stored = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
        expect(stored.messages).toHaveLength(2);
        // ▶ Continue is back.
        await expect(page.getByRole('form', { name: 'Composer' }).getByRole('button', { name: 'Continue' })).toBeEnabled();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('Sending a message while watching stops Watch and sends it as usual', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete(FAKE);
    await scriptReplies(request, 1, true);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const sheet = await openWatch(page);
        await sheet.getByRole('button', { name: 'Start watching' }).tap();
        const band = page.locator('[data-band="watch"]');
        await expect(band).toContainText('Watching · 1 of 5');
        await expect(page.getByText('Rain lashes')).toBeVisible();

        // The box stays free while watching; ▶ waits, Send doesn't.
        const composer = page.getByRole('form', { name: 'Composer' });
        await expect(composer.getByRole('button', { name: 'Continue' })).toBeDisabled();
        await request.post(`${FAKE}/text`, { data: { kind: 'turn', replies: [{ text: '@Mira: You speak at last, keeper.', model: 'glm-5.3' }] } });
        await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: [NO_CHANGE] } });
        await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('I clear my throat.');
        await composer.getByRole('button', { name: 'Send' }).tap();

        await expect(band).toBeHidden();
        await expect(page.getByRole('article', { name: 'Ash said' })).toContainText('I clear my throat.');
        const aiReplies = page.getByRole('article', { name: 'AI reply' });
        await expect(aiReplies.last()).toContainText('You speak at last, keeper.');
        // The reply Watch was writing was stopped: only the answer to the message is there.
        await expect(aiReplies).toHaveCount(1);
        await expect(page.locator('[data-band^="watch"]')).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

for (const width of [360, 320]) {
    test(`the Watch sheet and band fit a ${width}px phone`, async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        await request.delete(FAKE);
        await scriptReplies(request, 1, true);
        try {
            await page.setViewportSize({ width, height: 740 });
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const sheet = await openWatch(page);
            for (const name of ['3 replies', '5 replies', '10 replies']) {
                const box = await sheet.getByRole('radio', { name }).locator('..').boundingBox();
                expect(box!.x).toBeGreaterThanOrEqual(0);
                expect(box!.x + box!.width).toBeLessThanOrEqual(width);
                expect(box!.height).toBeGreaterThanOrEqual(44);
            }
            await noSidewaysScroll(page, width);
            await sheet.getByRole('button', { name: 'Start watching' }).tap();

            const band = page.locator('[data-band="watch"]');
            await expect(band).toContainText('Watching · 1 of 5');
            const stop = band.getByRole('button', { name: 'Stop' });
            const bandBox = (await band.boundingBox())!;
            const stopBox = (await stop.boundingBox())!;
            // One row: Stop sits inside it, whole, 44px tall.
            expect(bandBox.height).toBeLessThanOrEqual(48);
            expect(stopBox.x + stopBox.width).toBeLessThanOrEqual(width);
            expect(stopBox.height).toBeGreaterThanOrEqual(44);
            await noSidewaysScroll(page, width);
            await stop.tap();
            await expect(band).toBeHidden();
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
}

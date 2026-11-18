import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Cost view (.scratch/cost-view/spec.md), on a phone: what each reply cost behind a Settings switch,
// the month by model and by host on Usage, and a Snapshot's price on Draw.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const NO_OPS = '{"operations":[]}';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"not yet"}}';

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Ledger', setting: 'A lighthouse.', opening: '@Mira: Boots off, keeper.' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' } });
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    return { storyId, chatId };
}

/** No sideways scroll at this width. */
async function fitsAt(page: Page, width: number): Promise<void> {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test('Show cost per reply is off by default; on, a reply shows its cost and what it was spent on', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete(FAKE);
    await request.post(`${FAKE}/text`, { data: { kind: 'turn', replies: ['@Mira: Fine. Sit.'] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    try {
        await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I climb the stair.' } });
        await expect
            .poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1).judge?.status, { timeout: 10_000 })
            .toBe('done');
        const replyId = (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1).id as number;
        // The fake gateway records no usage: the costs are the API's answer, as tested in apps/api/test/cost-view.spec.ts.
        let costReads = 0;
        await page.route(`**/api/stories/${storyId}/chats/${chatId}/costs`, (route) => {
            costReads += 1;
            return route.fulfill({
                json: {
                    chatId,
                    messages: [
                        {
                            messageId: replyId,
                            costUsd: 0.0123,
                            calls: 4,
                            byKind: [
                                { kind: 'turn', costUsd: 0.0101, calls: 2, cache: { promptTokens: 20_000, cachedTokens: 12_400 } },
                                { kind: 'judge', costUsd: 0.0015, calls: 1, cache: null },
                                { kind: 'memory_extraction', costUsd: 0.0007, calls: 1, cache: null },
                            ],
                        },
                    ],
                },
            });
        });

        // Off by default: no cost anywhere, and none is read.
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const reply = page.getByRole('article', { name: 'AI reply' }).last();
        await expect(reply).toContainText('Fine. Sit.');
        await expect(page.getByRole('button', { name: /^Cost / })).toHaveCount(0);
        expect(costReads).toBe(0);

        // Settings, under This device.
        await page.goto('/settings');
        const device = page.getByRole('region', { name: 'This device' });
        const show = device.getByRole('switch', { name: 'Show cost per reply' });
        await expect(show).toHaveAttribute('aria-checked', 'false');
        await show.tap();
        await expect(show).toHaveAttribute('aria-checked', 'true');
        await fitsAt(page, 320);
        await page.setViewportSize({ width: 390, height: 844 });

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const cost = reply.getByRole('button', { name: 'Cost $0.0123' });
        await expect(cost).toHaveAttribute('aria-expanded', 'false');
        // The Opening cost nothing and shows nothing.
        await expect(page.getByRole('article', { name: 'Opening' }).getByRole('button', { name: /^Cost / })).toHaveCount(0);
        await cost.tap();
        const list = reply.getByRole('list', { name: 'What this reply cost' });
        await expect(list.getByRole('listitem')).toHaveCount(3);
        await expect(list.getByRole('listitem').first()).toContainText('Turns × 2 · 62% cached');
        await expect(list.getByRole('listitem').first()).toContainText('$0.0101');
        await expect(list.getByRole('listitem').nth(1)).toContainText('Bond, Arc and Scene checks');
        for (const width of [360, 320]) await fitsAt(page, width);
        // The amount keeps to the right of its label at 320px.
        const first = list.getByRole('listitem').first();
        const box = await first.boundingBox();
        expect(box!.width).toBeLessThanOrEqual(320);
        await cost.tap();
        await expect(list).toHaveCount(0);

        // Off again: gone.
        await page.goto('/settings');
        await page.getByRole('switch', { name: 'Show cost per reply' }).tap();
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(reply).toContainText('Fine. Sit.');
        await expect(page.getByRole('button', { name: /^Cost / })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test("the Usage page shows the month's spend by model and by host, with each one's cached share", async ({ page }) => {
    const pool = {
        spentUsd: 1.234,
        calls: 41,
        byKind: [{ kind: 'turn', spentUsd: 1.1, calls: 30 }],
        remainingUsd: 6,
        capUsd: 8,
        lowCreditPercent: 20,
        lowCredit: false,
        host: 'openrouter',
        cache: null,
        byModel: [
            { name: 'deepseek-v4-pro', spentUsd: 1.05, calls: 28, cache: { promptTokens: 1_000_000, cachedTokens: 280_000 } },
            { name: 'deepseek-v4-flash', spentUsd: 0.18, calls: 13, cache: null },
        ],
        byHost: [
            { name: 'deepinfra', spentUsd: 1.0, calls: 35, cache: null },
            { name: 'venice', spentUsd: 0.234, calls: 6, cache: null },
        ],
    };
    const image = {
        ...pool,
        host: null,
        byKind: [{ kind: 'snapshot_image', spentUsd: 0.45, calls: 9 }],
        byModel: [
            { name: 'seedream-v5-pro-edit', spentUsd: 0.33, calls: 5, cache: null },
            { name: 'qwen-image-3', spentUsd: 0.12, calls: 3, cache: null },
        ],
        byHost: [{ name: 'venice', spentUsd: 0.45, calls: 9, cache: null }],
    };
    await page.route('**/api/usage', (route) => route.fulfill({ json: { month: '2026-11', monthlyCap: null, pools: { text: pool, image } } }));
    await page.goto('/usage');

    const text = page.getByRole('region', { name: /^Text/ });
    const byModel = text.getByRole('table', { name: 'Text spend by model' });
    await expect(byModel.getByRole('row')).toHaveCount(3);
    await expect(byModel.getByRole('rowheader').first()).toContainText('deepseek-v4-pro');
    await expect(byModel.getByRole('rowheader').first()).toContainText('28% read from cache');
    await expect(byModel.getByRole('row').nth(1)).toContainText('$1.05');
    const byHost = text.getByRole('table', { name: 'Text spend by host' });
    await expect(byHost.getByRole('rowheader').first()).toHaveText('DeepInfra');
    // The image pool's By model is the Snapshot spend per model.
    const images = page.getByRole('region', { name: /^Images/ }).getByRole('table', { name: /spend by model/ });
    await expect(images.getByRole('rowheader')).toHaveText(['seedream-v5-pro-edit', 'qwen-image-3']);
    for (const width of [360, 320]) await fitsAt(page, width);
});

test("a Member's Usage page has no By model or By host", async ({ page }) => {
    const pool = { spentUsd: 0.5, calls: 4, byKind: [{ kind: 'turn', spentUsd: 0.5, calls: 4 }], remainingUsd: null, capUsd: 8, lowCreditPercent: 20, lowCredit: false, host: 'openrouter', cache: null, byModel: [], byHost: [] };
    await page.route('**/api/usage', (route) =>
        route.fulfill({ json: { month: '2026-11', monthlyCap: { capUsd: 5, spentUsd: 0.5, reached: false }, pools: { text: pool, image: { ...pool, host: null } } } }),
    );
    await page.goto('/usage');
    await expect(page.getByRole('table', { name: 'Text spend by kind' })).toBeVisible();
    await expect(page.getByRole('table', { name: /spend by (model|host)/ })).toHaveCount(0);
});

test('the Draw button carries what the Snapshot will cost', async ({ page, request }) => {
    await request.delete(FAKE);
    const { storyId, chatId } = await createChat(request);
    await request.post(`${FAKE}/text`, { data: { kind: 'snapshot_prompt', replies: [JSON.stringify({ in_frame: ['Mira'], scene: 'Mira by the window.' })] } });
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const opening = page.getByRole('article', { name: 'Opening' });
        await opening.getByRole('group', { name: 'Message actions' }).getByRole('button', { name: 'Snapshot' }).tap();
        const sheet = page.getByRole('dialog', { name: 'Take a Snapshot' });
        await sheet.getByRole('button', { name: 'Write the prompt' }).tap();
        await expect(sheet.getByRole('textbox', { name: 'Snapshot prompt' })).toHaveValue('Mira by the window.');
        // The Settings model and size decide it; Mira has no Reference image, so the text-only sibling draws.
        await expect(sheet.getByRole('button', { name: /^Draw Snapshot · \$\d+\.\d{2,4}$/ })).toBeVisible();
        for (const width of [360, 320]) await fitsAt(page, width);
        await sheet.getByRole('button', { name: 'Cancel' }).tap();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

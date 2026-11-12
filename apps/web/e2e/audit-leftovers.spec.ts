import { APIRequestContext, expect, Page, test } from '@playwright/test';

// UI audit rows finished after the Tailwind move (docs/ui-audit.md: M3, M38, H19, the Memory drawer on a jump), on a phone:
// 390px wide, with touch, unless a block says otherwise.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** A playable Story with Mira and one Chat, made through the API, with `memories` hand-written Memories known by Mira. */
async function createChat(request: APIRequestContext, memories = 0): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.' },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    const made = await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    expect(made.ok()).toBe(true);
    const mira = ((await made.json()) as { characters: { id: number }[] }).characters[0].id;
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    for (let at = 1; at <= memories; at += 1) {
        const added = await request.post(`/api/stories/${storyId}/chats/${chatId}/memories`, {
            data: { text: `Mira counted ${at} gulls on the rail.`, knownBy: [mira] },
        });
        expect(added.ok()).toBe(true);
    }
    return { storyId, chatId };
}

/** Answers /api/usage with the image pool low, `delayMs` late, so the page is drawn before the warning arrives. */
async function lowImageCredit(page: Page, delayMs: number): Promise<void> {
    const pool = (remainingUsd: number, lowCredit: boolean) => ({
        spentUsd: 8 - remainingUsd,
        calls: 3,
        byKind: [],
        remainingUsd,
        capUsd: 8,
        lowCreditPercent: 20,
        lowCredit,
    });
    await page.route('**/api/usage', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        await route.fulfill({ json: { month: '2026-11', pools: { text: pool(6, false), image: pool(1, true) } } });
    });
}

async function topOf(page: Page, locator: ReturnType<Page['getByRole']>): Promise<number> {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    return box!.y;
}

test('M3: the low-credit banner arrives at the foot of a page, above the bottom nav, and pushes nothing down', async ({ page }) => {
    await lowImageCredit(page, 1_500);
    await page.goto('/settings');
    const heading = page.getByRole('heading', { name: 'Settings', level: 1 });
    await expect(heading).toBeVisible();
    const before = await topOf(page, heading);

    const banner = page.getByRole('status').filter({ hasText: 'credit is low' });
    await expect(banner.getByRole('paragraph')).toHaveText(['Images and audio (Venice) credit is low: $1.00 of $8.00 left.']);
    expect(await topOf(page, heading)).toBe(before);

    // It sits over the page, just above the nav, until Hide puts it away.
    const bannerBox = (await banner.boundingBox())!;
    const navBox = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
    expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(navBox.y + 1);
    expect(bannerBox.y).toBeLessThan(844);
    await banner.getByRole('button', { name: 'Hide' }).tap();
    await expect(banner.getByRole('paragraph')).toHaveCount(0);
});

test('M3: on the Chat screen the low-credit line lies over the thread, so the top bar stays put', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    try {
        await lowImageCredit(page, 1_500);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const menu = page.getByRole('button', { name: 'Chat menu' });
        await expect(menu).toBeVisible();
        const opening = page.getByText('Boots off, keeper.');
        await expect(opening).toBeVisible();
        const menuAt = await topOf(page, menu);
        const openingAt = await topOf(page, opening);

        const line = page.getByRole('status').filter({ hasText: 'Credit is low' });
        await expect(line).toContainText('Images and audio (Venice) $1.00 of $8.00 left.');
        expect(await topOf(page, menu)).toBe(menuAt);
        expect(await topOf(page, opening)).toBe(openingAt);

        await line.getByRole('button', { name: 'Hide the credit warning' }).tap();
        await expect(line.getByText('Credit is low')).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('M38: on Settings the backup banner and the form show together, so neither arrives above the other', async ({ page }) => {
    await page.route('**/api/backup', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
        await route.fulfill({
            json: {
                configured: true,
                attemptedAt: '2026-11-04T14:15:00.000Z',
                backup: 'storytell-20261104-141500',
                targets: [
                    { target: 'disk', ok: true, at: '2026-11-04T14:15:00.000Z', error: null },
                    { target: 'drive', ok: false, at: '2026-11-04T14:15:00.000Z', error: 'Upload refused.' },
                ],
                error: null,
                failed: true,
            },
        });
    });
    await page.goto('/settings');
    const banner = page.getByRole('status', { name: 'Backup' });
    const field = page.getByLabel('Text pool (USD)');
    await expect(page.getByRole('status').filter({ hasText: 'Loading Settings…' })).toBeVisible();
    await expect(field).toBeVisible();
    // The form only shows once the banner is there too.
    expect(await banner.isVisible()).toBe(true);
    const fieldAt = (await field.boundingBox())!.y;
    await page.waitForTimeout(500);
    expect((await field.boundingBox())!.y).toBe(fieldAt);
});

test('H19: with more than 30 Memories, Graph opens as the list and says why, and choosing Graph shows it anyway', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request, 31);
    try {
        await page.addInitScript(() => window.localStorage.setItem('storytell.memoryView', 'graph'));
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
        const drawer = page.getByRole('dialog', { name: 'Memory' });

        await expect(drawer.getByText('31 Memories are too many to tap apart in the graph')).toBeVisible();
        await expect(drawer.getByRole('radio', { name: 'List' })).toBeChecked();
        await expect(drawer.getByRole('list', { name: 'Memories' }).locator('li[data-memory-id]')).toHaveCount(31);

        await drawer.getByRole('radio', { name: 'Graph' }).tap();
        await expect(drawer.getByRole('radio', { name: 'Graph' })).toBeChecked();
        await expect(drawer.getByText('too many to tap apart')).toHaveCount(0);
        await expect(drawer.getByRole('list', { name: 'Memories' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('H19: with 30 Memories or fewer, Graph opens as the graph', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request, 3);
    try {
        await page.addInitScript(() => window.localStorage.setItem('storytell.memoryView', 'graph'));
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
        const drawer = page.getByRole('dialog', { name: 'Memory' });
        await expect(drawer.getByRole('radio', { name: 'Graph' })).toBeChecked();
        await expect(drawer.getByText('too many to tap apart')).toHaveCount(0);
        await expect(drawer.getByRole('list', { name: 'Memories' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test.describe('docked beside the Chat (1440px wide)', () => {
    test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });

    test('"Go to the Message" keeps the docked Memory drawer open', async ({ page, request }) => {
        const { storyId } = await createChat(request);
        const extraction = JSON.stringify({
            operations: [{ op: 'add', text: '{user} climbed the cliff path in the storm.', known_by: ['Mira'], cause: 'Ash said so.' }],
        });
        await request.delete('/api/testing/fake-gateway');
        await request.post('/api/testing/fake-gateway/text', {
            data: { kind: 'turn', replies: [{ text: 'Mira looks up at last.\n\n@Mira: In this weather?', model: 'glm-5.3' }] },
        });
        await request.post('/api/testing/fake-gateway/text', {
            data: { kind: 'judge', replies: ['{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}'] },
        });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [extraction] } });
        try {
            await page.goto(`/stories/${storyId}/chats`);
            await page.getByRole('button', { name: 'New Chat' }).click();
            await page.getByLabel('Write as Ash').fill('I climbed the cliff path in the storm.');
            await page.getByRole('button', { name: 'Send' }).click();
            const reply = page.getByRole('article', { name: 'AI reply' });
            await expect(reply).toContainText('In this weather?');
            await page.getByRole('status').filter({ hasText: 'Memory added' }).click();

            const drawer = page.getByRole('complementary', { name: 'Memory' });
            const added = drawer.getByRole('listitem').filter({ hasText: 'Ash climbed the cliff path' });
            await added.getByRole('link', { name: 'Go to the Message' }).click();
            await expect(reply).toHaveClass(/message-target/);
            await expect(drawer).toBeVisible();
        } finally {
            await request.delete('/api/testing/fake-gateway');
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

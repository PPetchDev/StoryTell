import { APIRequestContext, expect, Page, test } from '@playwright/test';

// docs/ui-audit-2026-11-17.md, on the user's own phone width: 360px, with touch.
test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

/** A playable Story with Mira and one Chat, made through the API. */
async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
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
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

/** Answers /api/usage with the text pool below zero, as on the day OpenRouter's credit ran out. */
async function textUsedUp(page: Page): Promise<void> {
    const pool = (remainingUsd: number, lowCredit: boolean) => ({ spentUsd: 5, calls: 3, byKind: [], remainingUsd, capUsd: 5.85, lowCreditPercent: 20, lowCredit });
    await page.route('**/api/usage', (route) => route.fulfill({ json: { month: '2026-11', pools: { text: pool(-0.01, true), image: pool(8, false) } } }));
}

test('H1: the Chat menu fits a 360px phone, its tiles and switches inside the screen', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        const sheet = page.getByRole('dialog');
        await expect(sheet.getByRole('switch', { name: /Characters think for themselves/ })).toBeVisible();
        expect(await sheet.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
        for (const control of [sheet.getByRole('link', { name: 'Gallery' }), sheet.getByRole('switch', { name: /Characters think for themselves/ })]) {
            const box = (await control.boundingBox())!;
            expect(box.x + box.width).toBeLessThanOrEqual(360);
        }
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('H2: text credit below zero reads "used up", once, and the Usage page leaves the banner out', async ({ page, request }) => {
    await textUsedUp(page);
    await page.goto('/settings');
    const banner = page.getByRole('status').filter({ hasText: 'credit is used up' });
    await expect(banner.locator('strong')).toHaveText('Text credit is used up.');
    await expect(banner).not.toContainText('$-0.01');
    // One 44px line, not a block over the page.
    expect((await banner.getByRole('paragraph').boundingBox())!.height).toBeLessThanOrEqual(48);

    await page.goto('/usage');
    await expect(page.getByRole('heading', { name: 'Usage', level: 1 })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'credit is used up' })).toHaveCount(0);

    // In a Chat the composer says it; the line over the story doesn't say it again.
    const { storyId, chatId } = await createChat(request);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(page.getByText('Boots off, keeper.')).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: 'Text credit is used up.' }).locator('strong')).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test("M3: a Character's profile opens on their name, above the picture", async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Profile of Mira' }).first().tap();
        const sheet = page.getByRole('dialog', { name: 'Mira' });
        const name = sheet.getByRole('heading', { name: 'Mira', level: 2 });
        await expect(name).toBeVisible();
        const nameTop = (await name.boundingBox())!.y;
        const appearanceTop = (await sheet.getByRole('heading', { name: 'Appearance' }).boundingBox())!.y;
        expect(nameTop).toBeLessThan(appearanceTop);
        await expect(name).toBeInViewport();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

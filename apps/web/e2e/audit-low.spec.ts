import { APIRequestContext, expect, Locator, test } from '@playwright/test';

// The Low items of docs/ui-audit-2026-11-13.md, on a phone: Home, People, the "Saved" line, the
// Story Gallery's title, the Dashboard's way back, and the editor's cards and Assistant.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const TITLE = 'Welcome To Her Tribe, Where The Long Grass Grows';

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', {
        data: { title: TITLE, setting: 'A grassland camp.', opening: 'Smoke rose over the round tents.' },
    });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'A traveller.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' },
    });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

/** How many lines a box's text takes: the distinct tops of its text's line boxes. */
async function lines(locator: Locator): Promise<number> {
    return locator.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size;
    });
}

test('Home: "Continue" is one short line, and New Story is quiet beside its Play', async ({ page, request }) => {
    const { storyId } = await createChat(request);
    try {
        await page.goto('/');
        const row = page.getByRole('link', { name: /^Continue/ });
        const label = row.getByText('Continue', { exact: true });
        await expect(label).toBeVisible();
        expect(await lines(label)).toBe(1);
        await expect(page.getByRole('button', { name: 'New Story' })).toHaveClass(/button-quiet/);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('Settings says nothing about saving until something is edited; People says what to type and why Add refuses', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Credit' })).toBeVisible();
    const saveLine = page.locator('.save-state');
    await expect(saveLine).toHaveAttribute('data-state', 'saved');
    await expect(saveLine).toHaveText('');

    const form = page.getByRole('form', { name: 'Add a person' });
    await expect(form.getByLabel('Email')).toHaveAccessibleDescription('Their Google account, or the email login you made for them.');
    await expect(form.getByLabel('Monthly cap (USD)')).toBeVisible();
    // Add is never greyed out with no reason: it says what is missing.
    await form.getByRole('button', { name: 'Add' }).tap();
    await expect(form.getByRole('alert')).toHaveText('Enter the email they sign in with.');

    // Once something is edited, the line says so.
    const textSize = page.getByRole('radiogroup', { name: 'Text size' });
    await expect(textSize).toBeVisible();
    await page.getByLabel('Text warning (%)').fill('21');
    await expect(saveLine).toHaveText('Saved');
    await page.getByLabel('Text warning (%)').fill('20');
    await expect(saveLine).toHaveText('Saved');
});

test('the Story Gallery is titled "Gallery", the Story under it; the Dashboard has no bottom bar and a clear way back', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    try {
        await page.goto(`/stories/${storyId}/gallery`);
        // The Story's title first: the page shows a plain "Gallery" heading while it loads, then its own.
        await expect(page.getByText(TITLE, { exact: true })).toBeVisible();
        const heading = page.getByRole('heading', { level: 1 });
        await expect(heading).toHaveText('Gallery');
        expect(await lines(heading)).toBe(1);

        await page.goto(`/stories/${storyId}/chats/${chatId}/dashboard`);
        await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
        await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
        const back = page.getByRole('link', { name: /^Back to / });
        await expect(back).toBeVisible();
        expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await back.tap();
        await expect(page).toHaveURL(`/stories/${storyId}/chats/${chatId}`);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the editor\'s cards put the chevron first, whatever tools follow, and Assistant is not the Rewrite sparkle', async ({ page, request }) => {
    const { storyId } = await createChat(request);
    try {
        await page.goto(`/stories/${storyId}?tab=characters`);
        const toggle = page.getByRole('region', { name: 'Character 1' }).getByRole('heading', { name: 'Mira' }).getByRole('button');
        await expect(toggle).toBeVisible();
        // The chevron is the button's first child, before the Portrait and the name.
        expect(await toggle.evaluate((button) => button.firstElementChild?.tagName.toLowerCase())).toBe('svg');

        const assistant = page.getByRole('button', { name: 'Assistant' });
        const assistantIcon = await assistant.locator('svg').innerHTML();
        await page.getByRole('tab', { name: /^Story/ }).tap();
        const rewriteIcon = await page.getByRole('button', { name: /^Rewrite/ }).first().locator('svg').innerHTML();
        expect(assistantIcon).not.toBe(rewriteIcon);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

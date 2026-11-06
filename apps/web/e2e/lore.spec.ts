import { APIRequestContext, expect, test } from '@playwright/test';

// Lore (CONTEXT.md: "Lore") in the Story editor and the Memory drawer, on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'Dust rises over the market.\n\n@Nara: Welcome, traveller.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

async function createStory(request: APIRequestContext): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Market' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A grassland market.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Petch', description: 'A traveller.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Nara', appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.' },
    });
    return storyId;
}

test('an entry added in the Lore tab autosaves and survives a reload', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        await page.goto(`/stories/${storyId}`);
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const panel = page.getByRole('region', { name: 'Lore' });
        await expect(panel.getByText(/Notes about your world/)).toBeVisible();

        await panel.getByRole('button', { name: '+ Add Lore entry' }).tap();
        const card = panel.getByRole('region', { name: 'Lore 1' });
        await card.getByRole('textbox', { name: 'Name' }).fill('Tents');
        await card.getByRole('textbox', { name: 'Keywords' }).fill('yurt, กระโจม, ');
        await card.getByRole('textbox', { name: 'Text' }).fill('Round felt tents with a smoke hole.');
        await card.getByRole('radiogroup', { name: 'Include' }).getByRole('radio', { name: 'Always' }).tap();
        await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');
        // What was typed stays as typed, trailing comma and all.
        await expect(card.getByRole('textbox', { name: 'Keywords' })).toHaveValue('yurt, กระโจม, ');

        const stored = (await (await request.get(`/api/stories/${storyId}`)).json()) as { lore: unknown[] };
        expect(stored.lore).toEqual([{ id: expect.any(Number), name: 'Tents', keywords: ['yurt', 'กระโจม'], text: 'Round felt tents with a smoke hole.', alwaysOn: true }]);

        await page.reload();
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const reloaded = page.getByRole('region', { name: 'Lore 1' });
        await expect(reloaded.getByRole('heading', { name: 'Tents' })).toBeVisible();
        await expect(reloaded.getByRole('textbox', { name: 'Keywords' })).toHaveValue('yurt, กระโจม');
        await expect(reloaded.getByRole('radio', { name: 'Always' })).toBeChecked();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('after a turn that mentions an entry, the Memory drawer lists it in play', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.' } });
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Salt', text: 'Salt is money here.' } });
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
        const drawer = page.getByRole('complementary', { name: 'Memory' });
        const card = drawer.getByRole('region', { name: 'Lore in play' });
        await expect(card.getByText(/None right now/)).toBeVisible();
        await drawer.getByRole('button', { name: 'Close' }).first().click();

        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: '@Nara: My yurt is the blue one.', model: 'glm-5.3' }] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
        await page.getByLabel('Write as Petch').fill('Where do you sleep?');
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText('My yurt is the blue one.')).toBeVisible();

        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
        const list = drawer.getByRole('region', { name: 'Lore in play' }).getByRole('list', { name: 'Lore entries in play' });
        await expect(list.getByRole('listitem')).toHaveText(['Tents']);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

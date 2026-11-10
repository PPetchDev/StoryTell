import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Lore (CONTEXT.md: "Lore") in the Story editor and the Memory drawer, on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'Dust rises over the market.\n\n@Nara: Welcome, traveller.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';
// What a new Lore entry stores for its triggers when none are given (mirrors TRIGGER_DEFAULTS in apps/api/test/lore.spec.ts).
const TRIGGER_DEFAULTS = { secondaryKeywords: [], secondaryMode: 'alsoNeeds', patterns: [], recursable: true, sticky: 0, cooldown: 0, delay: 0, chance: 100, group: '' };

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
        expect(stored.lore).toEqual([
            { id: expect.any(Number), name: 'Tents', keywords: ['yurt', 'กระโจม'], text: 'Round felt tents with a smoke hole.', alwaysOn: true, ...TRIGGER_DEFAULTS },
        ]);

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

/** Opens the Memory drawer from the Chat menu and answers its Lore in play card. */
async function openLoreInPlay(page: Page) {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
    return page.getByRole('complementary', { name: 'Memory' }).getByRole('region', { name: 'Lore in play' });
}

async function scriptTurn(request: APIRequestContext, reply: string) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

test('with no entry in play, the Memory drawer says none right now', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        // Neither entry is Always on, and no Message names them yet.
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.' } });
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Salt', text: 'Salt is money here.' } });
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const card = await openLoreInPlay(page);
        await expect(card.getByText(/None right now/)).toBeVisible();
        await expect(card.getByRole('list', { name: 'Lore entries in play' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('after a turn that mentions an entry, the Memory drawer says it came up with the keyword', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.' } });
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Salt', text: 'Salt is money here.' } });
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Sky law', text: 'Never point at the moon.', alwaysOn: true } });
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        let card = await openLoreInPlay(page);
        await expect(card.getByRole('list', { name: 'Lore entries in play' }).getByRole('listitem')).toHaveText(['Sky law · always']);
        await page.getByRole('complementary', { name: 'Memory' }).getByRole('button', { name: 'Close' }).first().click();

        await scriptTurn(request, '@Nara: My yurt is the blue one.');
        await page.getByLabel('Write as Petch').fill('Where do you sleep?');
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText('My yurt is the blue one.')).toBeVisible();

        card = await openLoreInPlay(page);
        await expect(card.getByRole('list', { name: 'Lore entries in play' }).getByRole('listitem')).toHaveText([
            'Sky law · always',
            'Tents · came up: yurt, in the newest Message',
        ]);
        // Nothing was left out: no fold.
        await expect(card.getByText(/Came up but left out/)).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('an entry that came up but did not fit shows under the closed left-out fold once opened', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        // About 1,250 tokens each, under a cap of about 1,500: only the first to come up fits.
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Tents', keywords: ['yurt'], text: 'Felt. '.repeat(830) } });
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Traveller', text: 'Dust. '.repeat(830) } });
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;

        await scriptTurn(request, '@Nara: My yurt is the blue one.');
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByLabel('Write as Petch').fill('Where do you sleep?');
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText('My yurt is the blue one.')).toBeVisible();

        const card = await openLoreInPlay(page);
        await expect(card.getByRole('list', { name: 'Lore entries in play' }).getByRole('listitem')).toHaveText([
            'Tents · came up: yurt, in the newest Message',
        ]);
        const leftOut = card.getByRole('list', { name: 'Lore entries left out' });
        await expect(leftOut).toBeHidden();
        await card.getByText('Came up but left out (1)').click();
        await expect(leftOut.getByRole('listitem')).toHaveText(['Traveller · no room']);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

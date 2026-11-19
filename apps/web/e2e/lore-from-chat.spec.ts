import { APIRequestContext, expect, test } from '@playwright/test';

// Lore from this Chat (.scratch/lore-from-chat/spec.md), on a phone: 390px wide, with touch; then measured at 360 and 320.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'Smoke curls from the fire.\n\n@Nara: Drink, guest.';
const STAYS = '{"bond_changes":[],"arc_steps":[],"scene":{"reason":"Not yet.","move_on":false}}';
const NO_OPS = '{"operations":[]}';
const SUGGESTIONS = JSON.stringify({
    entries: [
        { name: 'The vigil', keywords: ['vigils'], text: 'A night when the camp keeps its lamps lit and no one sleeps until the river horn sounds.' },
        { name: 'The river horn', keywords: [], text: 'A horn blown at dawn from the river road.' },
    ],
});

const script = (request: APIRequestContext, kind: string, replies: unknown[]) => request.post('/api/testing/fake-gateway/text', { data: { kind, replies } });

/** Nara's camp and a Chat one reply in. */
async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Steppe' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: "A herders' camp on the steppe.", opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'A trader passing through.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Nara', appearance: 'Tall.', personality: 'Warm and teasing.', voice: 'Quick.' } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;

    await script(request, 'turn', [{ text: '@Nara: At the vigil, no one sleeps until the river horn sounds.', model: 'glm-5.3' }]);
    await script(request, 'judge', [STAYS]);
    await script(request, 'memory_extraction', [NO_OPS]);
    expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'What is the vigil?' } })).ok()).toBe(true);
    await expect
        .poll(async () => {
            const body = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
            return body.messages.at(-1).judge.status as string;
        })
        .toBe('done');
    return { storyId, chatId };
}

test('the Chat menu suggests Lore from the Chat; one tap adds one to the Story, the rest are left; it fits the phone', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const { storyId, chatId } = await createChat(request);
    try {
        await script(request, 'lore_suggestions', [SUGGESTIONS]);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Lore from this Chat/ }).tap();

        const sheet = page.getByRole('dialog', { name: 'Lore from this Chat' });
        const list = sheet.getByRole('list', { name: 'Suggested Lore' });
        await expect(list.getByRole('listitem')).toHaveCount(2);
        await expect(list.getByRole('listitem').first()).toContainText('The vigil');
        await expect(list.getByRole('listitem').first()).toContainText('Also: vigils');

        // Asking adds nothing.
        const loreNames = async () => ((await (await request.get(`/api/stories/${storyId}`)).json()).lore as Array<{ name: string }>).map((entry) => entry.name);
        expect(await loreNames()).toEqual([]);

        await sheet.getByRole('button', { name: 'Add The vigil to Lore' }).tap();
        await expect(sheet.getByRole('button', { name: 'The vigil added' })).toBeDisabled();
        await expect.poll(loreNames).toEqual(['The vigil']);
        const story = await (await request.get(`/api/stories/${storyId}`)).json();
        expect(story.lore[0]).toMatchObject({ name: 'The vigil', keywords: ['vigils'], text: expect.stringContaining('no one sleeps') });
        // The other is still there to add, and was not.
        await expect(sheet.getByRole('button', { name: 'Add The river horn to Lore' })).toBeEnabled();

        // It fits the phone: nothing wider than the screen, and Add is a thumb's size.
        for (const width of [360, 320]) {
            await page.setViewportSize({ width, height: 740 });
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
            const add = (await sheet.getByRole('button', { name: 'Add The river horn to Lore' }).boundingBox())!;
            expect(add.height).toBeGreaterThanOrEqual(44);
            expect(add.x + add.width).toBeLessThanOrEqual(width + 0.5);
        }

        await expect(sheet.getByRole('link', { name: "Open the Story's Lore" })).toHaveAttribute('href', `/stories/${storyId}?tab=lore`);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('an empty answer says so, and a failed one offers Retry', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const { storyId, chatId } = await createChat(request);
    try {
        await script(request, 'lore_suggestions', ['nothing readable', '{"entries":[]}']);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Lore from this Chat/ }).tap();
        const sheet = page.getByRole('dialog', { name: 'Lore from this Chat' });
        await expect(sheet.getByRole('alert')).toBeVisible();
        await sheet.getByRole('button', { name: 'Retry' }).tap();
        await expect(sheet.getByText('Nothing new for the Lore in this Chat yet.')).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a Chat with only its Opening has no Lore from this Chat in its menu', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const { storyId } = await createChat(request);
    try {
        const opening = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
        await page.goto(`/stories/${storyId}/chats/${opening}`);
        await expect(page.getByRole('article', { name: 'Opening' })).toContainText('Smoke curls from the fire.');
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        const menu = page.getByRole('dialog', { name: 'Chat menu' });
        await expect(menu.getByRole('button', { name: /^Previously on…/ })).toBeVisible();
        await expect(menu.getByRole('button', { name: /^Lore from this Chat/ })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

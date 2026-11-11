import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Memory by meaning (.scratch/memory-by-meaning/issues/02-choose-memories-by-meaning.md) in the
// Memory drawer, on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const LOCKED_WARNING = 'Your locked Memories take most of the room, so fewer others reach the story. Unlock some you no longer need.';

/** A playable Story with Mira and Kai, and a Chat of it. */
async function storyAndChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.' },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    for (const name of ['Mira', 'Kai']) {
        const made = await request.post(`/api/stories/${storyId}/characters`, {
            data: { name, appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        expect(made.ok()).toBe(true);
    }
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

/** One turn through the API, waited for until its extraction is done. */
async function play(request: APIRequestContext, storyId: number, chatId: number, text: string, reply: string, extraction: object[]): Promise<void> {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [reply] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [JSON.stringify({ operations: extraction })] } });
    expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text } })).ok()).toBe(true);
    await expect
        .poll(async () => {
            const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
            return chat.messages.at(-1).memory?.status;
        })
        .toBe('done');
}

async function openMemory(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
    const drawer = page.getByRole('complementary', { name: 'Memory' });
    await expect(drawer).toBeVisible();
    return drawer;
}

async function noSidewaysScroll(page: Page): Promise<void> {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

test('the Memory drawer marks "In play" on the Memories the last turn sent, and not on the rest', async ({ page, request }) => {
    const { storyId, chatId } = await storyAndChat(request);
    try {
        await request.delete('/api/testing/fake-gateway');
        await play(request, storyId, chatId, 'I look around the cellar.', '@Mira: Mind the stairs.', [
            { op: 'add', text: 'Mira hid the cellar key under the third stair.', known_by: ['Mira'], cause: 'she said so' },
            { op: 'add', text: 'Kai mended the north net at dawn.', known_by: ['Kai'], cause: 'he said so' },
        ]);
        await play(request, storyId, chatId, 'Mira, where is the cellar key?', '@Mira: Under the stair, where I left it.', []);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const drawer = await openMemory(page);
        const key = drawer.getByRole('listitem').filter({ hasText: 'Mira hid the cellar key under the third stair.' });
        const net = drawer.getByRole('listitem').filter({ hasText: 'Kai mended the north net at dawn.' });
        await expect(key).toContainText('In play');
        await expect(net).toBeVisible();
        await expect(net).not.toContainText('In play');
        await expect(drawer.getByRole('note').filter({ hasText: LOCKED_WARNING })).toHaveCount(0);
        await noSidewaysScroll(page);
    } finally {
        await request.delete('/api/testing/fake-gateway');
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Memory drawer warns once the locked Memories take more than half the room', async ({ page, request }) => {
    const { storyId, chatId } = await storyAndChat(request);
    try {
        // About 60 tokens each: 40 of them take more than half of the 4,000.
        for (let n = 0; n < 40; n++) {
            const added = await request.post(`/api/stories/${storyId}/chats/${chatId}/memories`, {
                data: { text: `{user} swore oath ${n} at the lamp: ${'never to let the light go dark, '.repeat(6)}`.trim() },
            });
            expect(added.ok()).toBe(true);
        }

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const drawer = await openMemory(page);
        const warning = drawer.getByRole('note').filter({ hasText: LOCKED_WARNING });
        await expect(warning).toBeVisible();
        await expect(warning).toHaveText(LOCKED_WARNING);
        await noSidewaysScroll(page);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

import { APIRequestContext, expect, Page, test } from '@playwright/test';

// The Story so far (CONTEXT.md: "Story so far") in the Memory drawer, on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';
const ACCOUNT = 'Ash came through the storm, and Mira took the first watch while the lamp stayed dark.';

/** About 5k tokens, so a few of these outgrow the turn prompt and a Story so far is written. */
const longReply = (turn: number) =>
    `Turn ${turn}. ${'Waves break on the rocks below the lamp room and the tower shakes. '.repeat(290)}\n\n@Mira: Hold the light.`;

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

/** Plays long turns through the API until the Chat has a Story so far. */
async function playUntilSummarised(request: APIRequestContext, storyId: number, chatId: number): Promise<void> {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'story_summary', replies: [ACCOUNT] } });
    for (let turn = 1; turn <= 6; turn++) {
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: longReply(turn), model: 'glm-5.3' }] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
        const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: `I keep watch, turn ${turn}.` } });
        expect(sent.ok()).toBe(true);
        // The judge, the extraction and then the Story so far check all run after the turn.
        for (let wait = 0; wait < 20; wait++) {
            const view = (await (await request.get(`/api/stories/${storyId}/chats/${chatId}/story-so-far`)).json()) as { text: string | null };
            if (view.text !== null) return;
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }
    throw new Error('No Story so far was written');
}

async function openMemory(page: Page) {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
    const drawer = page.getByRole('dialog', { name: 'Memory' });
    await expect(drawer).toBeVisible();
    return drawer.getByRole('region', { name: 'Story so far' });
}

test('a short Chat needs no Story so far yet', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const card = await openMemory(page);
        await expect(card.getByText('Not needed yet: the whole Chat still fits.')).toBeVisible();
        await expect(card.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a long Chat shows its Story so far and what it covers, and the user\'s edit saves and reads back as theirs', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const { storyId, chatId } = await createChat(request);
    try {
        await playUntilSummarised(request, storyId, chatId);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const card = await openMemory(page);

        await expect(card.getByText(ACCOUNT)).toBeVisible();
        await expect(card.getByText(/Covers the first \d+ Messages · Written by the AI/)).toBeVisible();

        await card.getByRole('button', { name: 'Edit' }).tap();
        const text = card.getByRole('textbox', { name: 'Story so far text' });
        await expect(text).toHaveValue(ACCOUNT);
        await text.fill('Ash promised Mira the red lantern before the storm broke.');
        await card.getByRole('button', { name: 'Save', exact: true }).tap();

        await expect(card.getByText('Ash promised Mira the red lantern before the storm broke.')).toBeVisible();
        await expect(card.getByText(/Written by you/)).toBeVisible();
        const saved = (await (await request.get(`/api/stories/${storyId}/chats/${chatId}/story-so-far`)).json()) as { writtenBy: string };
        expect(saved.writtenBy).toBe('user');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
        await request.delete('/api/testing/fake-gateway');
    }
});

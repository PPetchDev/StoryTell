import { APIRequestContext, expect, test } from '@playwright/test';

// Played on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

/** A playable Story with a Chat two turns in, all through the API, so the browser covers only the edit. */
async function createPlayedChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
    });
    await request.patch(`/api/stories/${storyId}/role`, {
        data: { name: 'Ash', description: 'The new keeper, arrived this morning.' },
    });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });

    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: {
            kind: 'turn',
            replies: [
                { text: '@Mira: Took you long enough.', model: 'glm-5.3' },
                { text: 'She points at the stairs.', model: 'glm-5.3' },
            ],
        },
    });
    // Each turn's background calls change nothing here: two turns now, one after the edit.
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'judge', replies: [NO_CHANGE, NO_CHANGE, NO_CHANGE] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS, NO_OPS, NO_OPS] } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    for (const text of ['I set my boots by the door.', 'Where is the lamp room?']) {
        const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text } });
        expect(sent.ok()).toBe(true);
    }
    return { storyId, chatId };
}

test('edits an earlier User Message, sees the later Messages gone and a new reply, then resets', async ({ page, request }) => {
    const { storyId, chatId } = await createPlayedChat(request);
    await request.post('/api/testing/fake-gateway/text', {
        data: {
            kind: 'turn',
            replies: [{ text: 'Rain drips from your coat.\n\n@Mira: Leave them on, then.', model: 'glm-5.3' }],
        },
    });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const said = page.getByRole('article', { name: 'Ash said' });
        const replies = page.getByRole('article', { name: 'AI reply' });
        await expect(said).toHaveCount(2);
        await expect(replies).toHaveCount(2);

        // An older Message offers Edit only once tapped.
        await expect(said.first().getByRole('button', { name: 'Edit' })).toHaveCount(0);
        await said.first().tap();
        await said.first().getByRole('button', { name: 'Edit' }).tap();
        // Saving asks first, since three Messages come after it.
        const box = page.getByRole('textbox', { name: 'Message text' });
        await expect(box).toHaveValue('I set my boots by the door.');
        await box.fill('I keep my boots on.');
        await page.getByRole('button', { name: 'Save' }).tap();
        await expect(page.getByText('This discards the 3 Messages after it')).toBeVisible();
        await page.getByRole('button', { name: 'Save and rewind' }).tap();

        // The later Messages are gone and one fresh reply follows the edited text.
        await expect(said).toHaveCount(1);
        await expect(said).toContainText('I keep my boots on.');
        await expect(replies).toHaveCount(1);
        await expect(replies).toContainText('Rain drips from your coat.');
        await expect(replies.getByRole('group', { name: 'Mira', exact: true })).toContainText('Leave them on, then.');
        await expect(page.getByText('Where is the lamp room?')).toHaveCount(0);

        // Reset clears everything but the Opening and keeps the title.
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Reset/ }).click();
        await page.getByRole('alertdialog', { name: /start this Chat over/ }).getByRole('button', { name: 'Reset' }).click();
        await expect(said).toHaveCount(0);
        await expect(replies).toHaveCount(0);
        await expect(page.getByRole('article', { name: 'Opening' })).toContainText('Boots off, keeper.');
        await expect(page.getByRole('heading', { name: 'Chat 1' })).toBeVisible();
    } finally {
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${storyId}`);
    }
});

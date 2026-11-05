import { expect, test } from '@playwright/test';

// ↺ Again is a phone gesture (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';
const CURIOUS = JSON.stringify({
    bond_changes: [{ from: 'Mira', to: 'user', label: 'Curious', description: 'Curious, in a word.', cause: 'Ash came in.' }],
    arc_steps: [],
    scene: { move_on: false, reason: 'not yet' },
});
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';

test('↺ Again replaces the newest reply in place with a different one, never on the Opening, and notes what it rolled back', async ({ page, request }) => {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: {
            kind: 'turn',
            replies: [
                { text: '@Mira: You took your time.', model: 'glm-5.3' },
                { text: 'Mira only points at the stairs.', model: 'glm-5.3' },
            ],
        },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [CURIOUS, NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS, NO_OPS] } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const actions = page.getByRole('group', { name: 'Message actions' });
        const again = actions.getByRole('button', { name: 'Again' });
        const articles = page.getByRole('region', { name: 'Messages' }).getByRole('article');

        // The Opening has the action row, but never ↺ Again.
        await expect(actions.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(again).toHaveCount(0);

        const composer = page.getByRole('form', { name: 'Composer' });
        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('I take my boots off.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        const reply = page.getByRole('article', { name: 'AI reply' });
        await expect(reply).toContainText('You took your time.');
        await expect(articles).toHaveCount(3);

        // ↺ Again comes first in the newest reply's row.
        await expect(actions.getByRole('button').first()).toHaveAccessibleName('Again');
        await again.tap();

        await expect(reply).toContainText('Mira only points at the stairs.');
        await expect(page.getByText('You took your time.')).toHaveCount(0);
        await expect(articles).toHaveCount(3);
        await expect(page.getByRole('status').filter({ hasText: 'Rolled back: 1 Bond change.' })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: 'Writing' })).toHaveCount(0);

        await page.reload();
        await expect(articles).toHaveCount(3);
        await expect(reply).toContainText('Mira only points at the stairs.');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

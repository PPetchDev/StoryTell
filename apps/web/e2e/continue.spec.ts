import { expect, test } from '@playwright/test';

// Continue is a phone gesture (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

test('▶ on an empty composer lets the story go on: two taps from the Opening, two replies, no user line', async ({ page, request }) => {
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
    const replies = ['@Mira: Well? The stairs will not climb themselves.', 'Mira takes the lantern and starts up without you.'];
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'turn', replies: replies.map((text) => ({ text, model: 'glm-5.3' })) },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: replies.map(() => NO_CHANGE) } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: replies.map(() => NO_OPS) } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const box = composer.getByRole('textbox', { name: 'Write as Ash' });
        const play = composer.getByRole('button', { name: 'Continue' });
        const aiReplies = page.getByRole('article', { name: 'AI reply' });

        // Empty, or only whitespace, the send button is ▶ Continue; text turns it back into Send.
        await expect(play).toBeEnabled();
        await box.fill('   ');
        await expect(play).toBeEnabled();
        await box.fill('Hello?');
        await expect(composer.getByRole('button', { name: 'Send' })).toBeEnabled();
        await expect(play).toHaveCount(0);
        await box.fill('');

        await play.tap();
        await expect(aiReplies).toHaveCount(1);
        await expect(aiReplies.last()).toContainText('The stairs will not climb themselves.');
        // Its background calls settle before the next turn may start.
        await expect(play).toBeEnabled();
        await play.tap();
        await expect(aiReplies).toHaveCount(2);
        await expect(aiReplies.last()).toContainText('Mira takes the lantern and starts up without you.');

        // Neither tap wrote a line for the user.
        await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(0);
        await expect(page.getByRole('status').filter({ hasText: 'Writing' })).toHaveCount(0);
        await page.reload();
        await expect(aiReplies).toHaveCount(2);
        await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

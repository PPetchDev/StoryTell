import { expect, test } from '@playwright/test';

// The Chat is played on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';
/** A judgement that changes nothing but the Time of day (spec: "Story clock"). */
const NIGHT = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false},"time_of_day":"night"}';

test('the Scene strip shows no time until the judge sets one, then the night', async ({ page, request }) => {
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
    await request.post(`/api/stories/${storyId}/scenes`, {
        data: { name: 'The stair', situation: 'Get past Mira to the lamp room.', moveOnCondition: '' },
    });

    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'turn', replies: [{ text: 'The last light goes from the sky.\n\n@Mira: Lamp, now.', model: 'glm-5.3' }] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NIGHT] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const strip = page.getByRole('button', { name: /^Scene:/ });
        await expect(strip).toContainText('The stair');
        // A new Chat has no time of day: the strip says nothing about one.
        await expect(strip).not.toContainText('Night');
        await expect(strip.getByText(/^Time:/)).toHaveCount(0);

        await page.getByLabel('Write as Ash').fill('I wait for dark.');
        await page.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Lamp, now.');

        // Once the turn's judge settles, the strip shows the night, after the Scene and before its goal.
        await expect(strip).toContainText('Night');
        await expect(strip).toHaveAccessibleName(/^Scene: The stair Time: Night Goal: Get past Mira/);
        const box = await strip.boundingBox();
        expect(box!.width).toBeLessThanOrEqual(390);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

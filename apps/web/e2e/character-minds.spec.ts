import { APIRequestContext, expect, test } from '@playwright/test';

// Character minds (.scratch/character-minds/spec.md), on a phone: a reply's Thoughts behind a tap,
// a Character's Goal on their profile, and the Chat menu's switch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const NO_OPS = '{"operations":[]}';

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse', setting: 'A lighthouse.', opening: '@Mira: Boots off, keeper.\n\n@Kai: Welcome!' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    for (const [name, personality] of [
        ['Mira', 'Guarded.'],
        ['Kai', 'Restless.'],
    ]) {
        await request.post(`/api/stories/${storyId}/characters`, { data: { name, appearance: 'Tall.', personality, voice: 'Short.' } });
    }
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    return { storyId, chatId };
}

test('a reply shows its Thoughts on a tap, a profile shows what they want now, and the Chat menu turns Thoughts off', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete('/api/testing/fake-gateway');
    const judge = JSON.stringify({
        bond_changes: [],
        arc_steps: [],
        scene: { move_on: false, reason: 'not yet' },
        details: { goals: [{ character: 'Mira', goal: 'Get the lamp lit before the ship passes' }] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'character_thought', replies: ['I want this keeper gone by spring.', 'The new one seems fun!'] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: '@Mira: Fine.\n\n@Kai: Great!', model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [judge] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    try {
        await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I climb the stair.' } });
        await expect
            .poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1).judge?.status, { timeout: 10_000 })
            .toBe('done');
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const reply = page.getByRole('article', { name: 'AI reply' }).last();
        await expect(reply).toContainText('Great!');

        // Behind a tap, never shown before it.
        const button = reply.getByRole('button', { name: 'Thoughts' });
        await expect(button).toHaveAttribute('aria-expanded', 'false');
        await expect(reply).not.toContainText('gone by spring');
        await button.tap();
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        const list = reply.getByRole('list', { name: 'What they thought' });
        await expect(list).toContainText('I want this keeper gone by spring.');
        await expect(list).toContainText('The new one seems fun!');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

        // What she is after, on her profile.
        await reply.getByRole('button', { name: 'Profile of Mira' }).tap();
        const profile = page.getByRole('dialog', { name: 'Mira' });
        await expect(profile.getByRole('heading', { name: 'Wants now' })).toBeVisible();
        await expect(profile.locator('[data-goal]')).toContainText('Get the lamp lit before the ship passes');
        await page.keyboard.press('Escape');

        // The switch, on by default, off on a tap.
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        const think = page.getByRole('dialog', { name: 'Chat menu' }).getByRole('switch', { name: /Characters think for themselves/ });
        await expect(think).toHaveAttribute('aria-checked', 'true');
        await think.tap();
        await expect(think).toHaveAttribute('aria-checked', 'false');
        expect((await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).characterThoughts).toBe(false);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

import { expect, test } from '@playwright/test';

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

/**
 * Ticket 29: removing a Character from a Story with a Chat warns what goes in every Chat,
 * and the Chat still shows that Character's old speech under its stamped name.
 */
test('removing a Character warns first, and an existing Chat keeps its old speech under the stamped name', async ({ page, request }) => {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;

    try {
        await request.patch(`/api/stories/${storyId}`, {
            data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
        });
        await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
        await request.post(`/api/stories/${storyId}/characters`, {
            data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        await request.post(`/api/stories/${storyId}/characters`, {
            data: { name: 'Kai', appearance: 'Wiry, sunburnt.', personality: 'Cheerful, nosy.', voice: 'Rambling.' },
        });

        await request.delete('/api/testing/fake-gateway');
        await request.post('/api/testing/fake-gateway/text', {
            data: { kind: 'turn', replies: [{ text: '@Kai: Welcome, keeper! Mind the third step.\n\n@Mira: Hush.', model: 'glm-5.3' }] },
        });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
        const chat = await request.post(`/api/stories/${storyId}/chats`);
        expect(chat.ok()).toBe(true);
        const chatId = (await chat.json()).id as number;
        const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I knock.' } });
        expect(sent.ok()).toBe(true);
        await expect
            .poll(async () => {
                const current = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
                return current.messages[2].judge.status as string;
            })
            .toBe('done');

        await page.goto(`/stories/${storyId}`);
        const kai = page.getByRole('region', { name: 'Character 2' });
        await expect(kai.getByLabel('Name')).toHaveValue('Kai');
        await kai.getByRole('button', { name: 'Remove' }).click();

        const confirm = kai.getByRole('group', { name: 'Remove Kai?' });
        await expect(confirm).toContainText("In every Chat of this Story, Kai's Bonds (both ways, with their history), Arc steps and Arc directions are deleted");
        await expect(confirm).toContainText("Kai is dropped from every Memory's Known by");
        await expect(confirm).toContainText('Past lines and Snapshots keep the name Kai.');
        // Cancel keeps him; confirming removes him.
        await confirm.getByRole('button', { name: 'Cancel' }).click();
        await expect(kai.getByLabel('Name')).toHaveValue('Kai');
        await kai.getByRole('button', { name: 'Remove' }).click();
        await kai.getByRole('group', { name: 'Remove Kai?' }).getByRole('button', { name: 'Remove' }).click();
        await expect(page.getByRole('region', { name: 'Character 2' })).toHaveCount(0);
        await expect
            .poll(async () => ((await (await request.get(`/api/stories/${storyId}`)).json()).characters as unknown[]).length)
            .toBe(1);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const reply = page.getByRole('article', { name: 'AI reply' });
        const kaiLine = reply.locator('.speech').filter({ hasText: 'Welcome, keeper!' });
        await expect(kaiLine.locator('.speaker')).toHaveText('Kai');
        await expect(kaiLine).toContainText('Mind the third step.');
        await expect(reply.locator('.speech').filter({ hasText: 'Hush.' }).locator('.speaker')).toHaveText('Mira');
    } finally {
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${storyId}`);
    }
});

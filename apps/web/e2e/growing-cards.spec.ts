import { APIRequestContext, expect, test } from '@playwright/test';

// Growing cards (.scratch/growing-cards/spec.md), on the user's 360px phone: the Judge's Now note
// on a Character's profile under "Changed in this Chat", which the user edits and clears there.
test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

const NO_OPS = '{"operations":[]}';

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number; nara: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Summer Market', setting: 'A market town.', opening: '@Nara: Morning, traveller.' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Petch', description: 'A traveller.' } });
    const story = await (await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Calls the user "traveller".' } })).json();
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    return { storyId, chatId, nara: story.characters[0].id as number };
}

test('a profile shows what changed in this Chat, and the user edits and clears it', async ({ page, request }) => {
    const { storyId, chatId, nara } = await createChat(request);
    await request.delete('/api/testing/fake-gateway');
    const judge = JSON.stringify({
        bond_changes: [],
        arc_steps: [],
        scene: { move_on: false, reason: 'not yet' },
        details: { now: [{ character: 'Nara', note: 'Calls {user} "my love", no longer "traveller". Married to {user} since the summer market.' }] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: '@Nara: Morning, husband.', model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [judge] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    const chatNow = async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).nowNotes as Array<{ characterId: number; note: string }>;
    try {
        await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I kiss my wife.' } });
        await expect
            .poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1).judge?.status, { timeout: 10_000 })
            .toBe('done');
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const reply = page.getByRole('article', { name: 'AI reply' }).last();
        await expect(reply).toContainText('Morning, husband.');

        // The Judge's note, with the user's name in place of {user}.
        await reply.getByRole('button', { name: 'Profile of Nara' }).tap();
        const profile = page.getByRole('dialog', { name: 'Nara' });
        await expect(profile.getByRole('heading', { name: 'Changed in this Chat' })).toBeVisible();
        const note = profile.locator('[data-now-note]');
        await expect(note).toContainText('Calls Petch "my love", no longer "traveller". Married to Petch since the summer market.');
        for (const width of [360, 320]) {
            await page.setViewportSize({ width, height: 780 });
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }
        await page.setViewportSize({ width: 360, height: 780 });

        // Edit: the box holds the note as shown; Save keeps it with {user}.
        await profile.getByRole('button', { name: 'Edit what changed for Nara' }).tap();
        const box = profile.getByRole('textbox', { name: 'What changed for Nara' });
        await expect(box).toHaveValue('Calls Petch "my love", no longer "traveller". Married to Petch since the summer market.');
        await box.fill('Calls Petch "my love". Married to Petch. Lives above the stall.');
        await expect(profile.getByText('63 / 300')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
        await profile.getByRole('button', { name: 'Save' }).tap();
        await expect(note).toContainText('Calls Petch "my love". Married to Petch. Lives above the stall.');
        expect(await chatNow()).toEqual([{ characterId: nara, note: 'Calls {user} "my love". Married to {user}. Lives above the stall.' }]);

        // Cancel leaves it; Clear takes it away and offers to write one again.
        await profile.getByRole('button', { name: 'Edit what changed for Nara' }).tap();
        await profile.getByRole('textbox', { name: 'What changed for Nara' }).fill('Something else.');
        await profile.getByRole('button', { name: 'Cancel' }).tap();
        await expect(note).toContainText('Lives above the stall.');
        await profile.getByRole('button', { name: 'Edit what changed for Nara' }).tap();
        await profile.getByRole('button', { name: 'Clear' }).tap();
        await expect(note).toHaveCount(0);
        await expect(profile.getByRole('button', { name: 'Add what changed in this Chat' })).toBeVisible();
        expect(await chatNow()).toEqual([]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

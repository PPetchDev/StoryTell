import { expect, test } from '@playwright/test';

// Starting Beliefs (.scratch/memory-by-meaning/issues/05-starting-beliefs.md) on a phone: 390px wide,
// with touch. The people are adults in a hill-tribe Story where Petch hides that he is a Marquis.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('a Starting Belief added in the Story editor beside the Starting Bonds is in a new Chat\'s Memory drawer', async ({ page, request }) => {
    const created = await request.post('/api/stories', { data: { title: 'The Hill Camp' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    try {
        await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A hill camp of herders.', opening: 'Smoke rises over the camp.\n\n@Nara: Another stranger.' } });
        await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Petch', description: 'A traveller.' } });
        for (const name of ['Nara', 'Kai']) {
            const made = await request.post(`/api/stories/${storyId}/characters`, {
                data: { name, appearance: 'Tall, weathered.', personality: 'Proud.', voice: 'Low.' },
            });
            expect(made.ok()).toBe(true);
        }

        await page.goto(`/stories/${storyId}?tab=bonds`);
        const bonds = page.getByRole('region', { name: 'Bonds' });
        await expect(bonds.getByRole('region', { name: 'Starting Bonds from Nara' })).toBeVisible();
        const card = bonds.getByRole('region', { name: 'Starting Beliefs' });
        await card.getByRole('button', { name: 'Add Belief' }).tap();
        const belief = card.getByRole('group', { name: 'Starting Belief 1' });
        await belief.getByLabel('Who believes it').selectOption({ label: 'Nara' });
        await belief.getByLabel('What they believe').fill('{user} is a wandering herder.');
        await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

        // A reload keeps it.
        await page.reload();
        const reloaded = page.getByRole('region', { name: 'Starting Beliefs' }).getByRole('group', { name: 'Starting Belief 1' });
        await expect(reloaded.getByLabel('What they believe')).toHaveValue('{user} is a wandering herder.');
        await expect(reloaded.getByLabel('Who believes it').locator('option:checked')).toHaveText('Nara');

        // A new Chat begins with it as Nara's Belief.
        const chat = await request.post(`/api/stories/${storyId}/chats`);
        expect(chat.ok()).toBe(true);
        const chatId = (await chat.json()).id as number;
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
        const drawer = page.getByRole('dialog', { name: 'Memory' });
        const nara = drawer.getByRole('region', { name: 'Beliefs' }).getByRole('list', { name: 'Nara’s Beliefs' }).getByRole('listitem');
        await expect(nara).toHaveCount(1);
        await expect(nara).toContainText('Nara believes Petch is a wandering herder.');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

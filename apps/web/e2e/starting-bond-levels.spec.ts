import { expect, test } from '@playwright/test';

import { openCard } from './harness/editor';

// Starting Bond levels (.scratch/bond-axes/issues/02-starting-bond-levels.md) are set on a phone:
// 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('a Starting Bond picks its levels by their words, starting in the middle, and a reload keeps them', async ({ page, request }) => {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    try {
        await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
        const mira = await request.post(`/api/stories/${storyId}/characters`, {
            data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        const miraId = (await mira.json()).characters[0].id as number;
        await request.post(`/api/stories/${storyId}/starting-bonds`, {
            data: { fromCharacterId: miraId, toCharacterId: null, label: 'Wary', description: 'She expects the new keeper to leave by spring.' },
        });

        await page.goto(`/stories/${storyId}?tab=bonds`);
        // The card starts folded.
        const bond = (await openCard(page, 'Starting Bonds from Mira')).getByRole('group', { name: 'Bond toward Ash (the Role)' });
        const trust = bond.getByLabel('Trust');
        // Every picker starts in the middle, named by its word.
        await expect(trust.locator('option:checked')).toHaveText('unsure');
        await expect(bond.getByLabel('Affection').locator('option:checked')).toHaveText('indifferent');
        await expect(bond.getByLabel('Desire').locator('option:checked')).toHaveText('no pull');
        await expect(bond.getByLabel('Tension').locator('option:checked')).toHaveText('at ease');
        // Each picker offers every word of its axis, and no number.
        await expect(trust.locator('option')).toHaveText([
            'betrayed',
            'suspicious',
            'wary',
            'unsure',
            'inclined to trust',
            'trusts',
            'trusts completely',
        ]);
        await expect(bond.getByLabel('Tension').locator('option')).toHaveText(['at ease', 'uneasy', 'strained', 'at breaking point']);
        const pickers = bond.getByRole('group', { name: 'Starting levels' });
        await expect(pickers).not.toContainText(/\d/);

        await trust.selectOption({ label: 'trusts' });
        await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');

        await page.reload();
        const reloaded = page.getByRole('region', { name: 'Starting Bonds from Mira' }).getByRole('group', { name: 'Bond toward Ash (the Role)' });
        await expect(reloaded.getByLabel('Trust').locator('option:checked')).toHaveText('trusts');
        await expect(reloaded.getByLabel('Affection').locator('option:checked')).toHaveText('indifferent');
        await expect(reloaded.getByRole('group', { name: 'Starting levels' })).not.toContainText(/\d/);
        // No number leaks anywhere in the Bond's own text either.
        expect(await reloaded.getByRole('group', { name: 'Starting levels' }).innerText()).not.toMatch(/\d/);

        // The API holds the level the word stands for.
        const story = await (await request.get(`/api/stories/${storyId}`)).json();
        expect(story.startingBonds[0]).toMatchObject({ trust: 2, affection: 0, desire: 0, tension: 0 });
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

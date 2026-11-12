import { expect, test } from '@playwright/test';

// Bond gates (.scratch/bond-axes/issues/04-bond-gates.md), set and read on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('the Scene editor adds a Bond gate by its word, which makes the Scene playable, and the Scene strip says what it waits for', async ({
    page,
    request,
}) => {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    try {
        await request.patch(`/api/stories/${storyId}`, {
            data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: 'The lamp went out an hour ago.\n\n@Nara: Boots off, keeper.' },
        });
        await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
        await request.post(`/api/stories/${storyId}/characters`, {
            data: { name: 'Nara', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        await request.post(`/api/stories/${storyId}/characters`, {
            data: { name: 'Kai', appearance: 'Wiry, sunburnt.', personality: 'Cheerful, nosy.', voice: 'Rambling.' },
        });
        // Arrival has no move-on condition yet, so the Story can't be played.
        await request.post(`/api/stories/${storyId}/scenes`, { data: { name: 'Arrival', situation: 'Reach the lamp room.' } });
        await request.post(`/api/stories/${storyId}/scenes`, { data: { name: 'The lamp', situation: 'Light it.' } });

        await page.goto(`/stories/${storyId}?tab=scenes`);
        const status = page.getByRole('region', { name: 'Playable status' });
        // The list starts folded to its count (audit M47).
        await status.getByRole('button', { name: /to fill in/ }).click();
        await expect(status).toContainText('Arrival: Move-on condition');

        const arrival = page.getByRole('region', { name: 'Scene 1' });
        await arrival.getByRole('button', { name: 'Add Bond gate' }).click();
        const gate = arrival.getByRole('group', { name: 'Bond gate 1' });
        await gate.getByLabel('Character').selectOption({ label: 'Nara' });
        await gate.getByLabel('Toward').selectOption({ label: 'Ash (the Role)' });
        await gate.getByLabel('Feeling').selectOption({ label: 'Trust' });
        await gate.getByLabel('At least').selectOption({ label: 'trusts' });
        // The level is a word; no number shows.
        await expect(gate.getByLabel('At least').locator('option:checked')).toHaveText('trusts');
        await expect(gate).not.toContainText(/\d/);
        await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');
        // A gate is a way to move on: the Story can be played.
        await expect(status).toContainText('Playable');

        await page.reload();
        const kept = page.getByRole('region', { name: 'Scene 1' }).getByRole('group', { name: 'Bond gate 1' });
        await expect(kept.getByLabel('Character').locator('option:checked')).toHaveText('Nara');
        await expect(kept.getByLabel('Toward').locator('option:checked')).toHaveText('Ash (the Role)');
        await expect(kept.getByLabel('Feeling').locator('option:checked')).toHaveText('Trust');
        await expect(kept.getByLabel('At least').locator('option:checked')).toHaveText('trusts');
        const story = await (await request.get(`/api/stories/${storyId}`)).json();
        expect(story.scenes[0].gates).toEqual([{ fromCharacterId: story.characters[0].id, toCharacterId: null, axis: 'trust', atLeast: 2 }]);

        // In play, the Scene strip says what the Scene waits for, in words.
        const chat = await request.post(`/api/stories/${storyId}/chats`);
        expect(chat.ok()).toBe(true);
        const chatId = (await chat.json()).id as number;
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const strip = page.getByRole('button', { name: /Scene: Arrival/ });
        await expect(strip).toContainText('Waiting for: Nara toward you, Trust at least trusts');
        await expect(strip).not.toContainText(/\d/);
        // Read whole on a phone: it wraps onto its own line instead of being cut off with "…".
        const waiting = strip.getByText(/^Waiting for:/);
        await expect(waiting).toBeVisible();
        expect(await waiting.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
        const box = (await waiting.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(390);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

        // Removing the gate takes it out again, and Arrival needs its condition once more.
        await page.goto(`/stories/${storyId}?tab=scenes`);
        await page.getByRole('region', { name: 'Scene 1' }).getByRole('group', { name: 'Bond gate 1' }).getByRole('button', { name: 'Remove gate' }).click();
        await expect(page.getByRole('region', { name: 'Scene 1' }).getByRole('group', { name: 'Bond gate 1' })).toHaveCount(0);
        await expect(page.getByRole('region', { name: 'Playable status' })).toContainText('Arrival: Move-on condition');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

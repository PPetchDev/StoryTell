import { expect, test } from '@playwright/test';

// Home is used on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';

test('Duplicate on a Story card makes "<title> (copy)" with the cast and Scenes, and opens it in the editor', async ({ page, request }) => {
    const created = await request.post('/api/stories', {
        data: { title: 'The Lighthouse', setting: 'A storm-cut island.', opening: OPENING },
    });
    const sourceId = (await created.json()).id as number;
    await request.patch(`/api/stories/${sourceId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${sourceId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded.', voice: 'Short.' },
    });
    await request.post(`/api/stories/${sourceId}/scenes`, {
        data: { name: 'Arrival', situation: 'Ash comes in from the rain.', moveOnCondition: 'Boots are off.' },
    });
    await request.post(`/api/stories/${sourceId}/chats`);
    const storyIds = [sourceId];

    try {
        await page.goto('/');
        await page.getByRole('list', { name: 'Stories' }).getByRole('button', { name: /The Lighthouse/ }).tap();
        await page.getByRole('dialog', { name: 'The Lighthouse' }).getByRole('button', { name: 'Duplicate' }).tap();

        // The copy opens in the editor, with what the author wrote and none of the Chats.
        await expect(page).toHaveURL(/\/stories\/\d+$/);
        const copyId = Number(new URL(page.url()).pathname.split('/').pop());
        storyIds.push(copyId);
        expect(copyId).not.toBe(sourceId);
        await expect(page.getByLabel('Title')).toHaveValue('The Lighthouse (copy)');
        await expect(page.getByLabel('Opening')).toHaveValue(OPENING);
        const copy = await (await request.get(`/api/stories/${copyId}`)).json();
        expect(copy.characters.map((character: { name: string }) => character.name)).toEqual(['Mira']);
        expect(copy.scenes.map((scene: { name: string }) => scene.name)).toEqual(['Arrival']);
        expect((await (await request.get(`/api/stories/${copyId}/chats`)).json()).chats).toEqual([]);

        // Both are on Home.
        await page.goto('/');
        const cards = page.getByRole('list', { name: 'Stories' });
        await expect(cards.getByRole('button', { name: /The Lighthouse \(copy\)/ })).toBeVisible();
        await expect(cards.getByRole('button', { name: /The Lighthouse/ })).toHaveCount(2);
    } finally {
        for (const storyId of storyIds) await request.delete(`/api/stories/${storyId}`);
    }
});

import { APIRequestContext, expect, test } from '@playwright/test';

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';

/** A playable Story made through the API, so the browser test covers only the play flow. */
async function createPlayableStory(request: APIRequestContext): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
    });
    await request.patch(`/api/stories/${storyId}/role`, {
        data: { name: 'Ash', description: 'The new keeper, arrived this morning.' },
    });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: {
            name: 'Mira',
            appearance: 'Tall, grey eyes.',
            personality: 'Guarded and dry.',
            voice: 'Short sentences.',
        },
    });
    return storyId;
}

test('starts a Chat, sees the Opening, sends, and sees narration plus named speech', async ({ page, request }) => {
    const storyId = await createPlayableStory(request);
    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: {
            kind: 'turn',
            replies: [
                {
                    text: 'Rain drips from your hat onto the floorboards.\n\n@Mira: Took you long enough.\n\nShe does not look up.',
                    model: 'glm-5.3',
                },
            ],
        },
    });
    // The turn's background calls (the judge, Memory extraction) change nothing here.
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'judge', replies: ['{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}'] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: ['{"operations":[]}'] } });

    try {
        await page.goto(`/stories/${storyId}/chats`);
        await expect(page.getByText('No Chats yet.')).toBeVisible();
        await page.getByRole('button', { name: 'New Chat' }).click();
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats/\\d+$`));
        await expect(page.getByRole('heading', { name: 'Chat 1' })).toBeVisible();

        // The Opening is Message 1, split into narration and Mira's speech.
        const opening = page.getByRole('article', { name: 'Opening' });
        await expect(opening).toContainText('The lamp went out an hour ago.');
        await expect(opening.locator('.speaker')).toHaveText('Mira');
        await expect(opening).toContainText('Boots off, keeper.');

        await page.getByLabel('Write as Ash').fill('I pull my boots off and set them by the door.');
        await page.getByRole('button', { name: 'Send' }).click();

        const said = page.getByRole('article', { name: 'Ash said' });
        await expect(said).toContainText('I pull my boots off and set them by the door.');
        const reply = page.getByRole('article', { name: 'AI reply' });
        await expect(reply).toContainText('Rain drips from your hat onto the floorboards.');
        await expect(reply.locator('.speaker')).toHaveText('Mira');
        await expect(reply).toContainText('Took you long enough.');
        await expect(reply).toContainText('She does not look up.');
        await expect(page.getByText('Drift notice')).toHaveCount(0);

        // The Chat list shows it, with its times.
        await page.getByRole('link', { name: '← Chats' }).click();
        const listed = page.getByRole('list', { name: 'Chats' }).getByRole('link', { name: /Chat 1/ });
        await expect(listed).toContainText('Last played');
    } finally {
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${storyId}`);
    }
});

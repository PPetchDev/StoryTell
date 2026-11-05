import { APIRequestContext, expect, test } from '@playwright/test';

/** The fake gateway's control routes, reached through the Next.js /api proxy. */
const FAKE = '/api/testing/fake-gateway';

const APPEARANCE = 'Tall, grey-green eyes, black hair tied back, a faint old scar through one eyebrow.';

/** A playable Story with one Character, made through the API so the browser test covers only the image flow. */
async function createStoryWithMira(request: APIRequestContext): Promise<{ storyId: number; characterId: number }> {
    const created = await request.post('/api/stories', {
        data: {
            title: 'The Lighthouse',
            setting: 'A lighthouse on a storm-cut island, 1890s.',
            opening: 'The lamp went out an hour ago.',
            imageStyle: 'ink wash, muted',
        },
    });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, {
        data: { name: 'Ash', description: 'The new keeper, arrived this morning.' },
    });
    const added = await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: APPEARANCE, personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    expect(added.ok()).toBe(true);
    return { storyId, characterId: (await added.json()).characters[0].id as number };
}

test('generates 4 candidates, picks one, and sees the Reference image on the Character page only', async ({
    page,
    request,
}) => {
    const { storyId, characterId } = await createStoryWithMira(request);
    await request.delete(FAKE);
    // Four scripted images; the fake's default 1x1 PNG is enough to see them load.
    const scripted = await request.post(`${FAKE}/image`, { data: { kind: 'reference_image', replies: [{}, {}, {}, {}] } });
    expect(scripted.status()).toBe(204);

    try {
        await page.goto(`/stories/${storyId}?tab=characters`);
        const mira = page.getByRole('region', { name: 'Character 1' });
        await expect(mira.getByRole('img', { name: 'Reference image of Mira' })).toHaveCount(0);

        await mira.getByRole('button', { name: 'Generate Reference image' }).click();
        const candidates = mira.getByRole('group', { name: 'Reference image candidates for Mira' });
        await expect(candidates.getByRole('img')).toHaveCount(4);
        for (const candidate of await candidates.getByRole('img').all()) {
            await expect.poll(() => candidate.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
        }
        // Nothing is stored until a pick.
        let story = await (await request.get(`/api/stories/${storyId}`)).json();
        expect(story.characters[0].referenceImagePath).toBeNull();

        await candidates.getByRole('button', { name: 'Use candidate 2' }).click();

        const image = mira.getByRole('img', { name: 'Reference image of Mira' });
        await expect(image).toBeVisible();
        await expect(image).toHaveAttribute('src', /^\/api\/images\/reference-images\/story-\d+\/character-\d+-[0-9a-f]+\.png$/);
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
        await expect(candidates).toHaveCount(0);
        await expect(mira.getByRole('button', { name: 'Generate a new Reference image' })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');

        story = await (await request.get(`/api/stories/${storyId}`)).json();
        expect(story.characters[0].referenceImagePath).toMatch(/^reference-images\//);

        // Four reference_image calls, drawn from the Appearance in the Story's Image style.
        const calls = await (await request.get(`${FAKE}/calls`)).json();
        const made = calls.calls.filter(
            (call: { method: string; request?: { kind: string } }) =>
                call.method === 'generateImage' && call.request?.kind === 'reference_image',
        );
        expect(made).toHaveLength(4);
        for (const call of made) {
            expect(call.request.prompt).toContain(APPEARANCE);
            expect(call.request.prompt).toContain('ink wash, muted');
            expect(call.request.servedFor).toEqual({ storyId });
        }

        // Editing the Appearance offers a new image, never forces one.
        await mira.getByLabel('Appearance').fill(`${APPEARANCE} Wears a grey wool coat.`);
        const offer = mira.getByRole('status').filter({ hasText: 'Make a new Reference image?' });
        await expect(offer).toBeVisible();
        await expect(offer).toContainText('The Appearance changed.');
        await offer.getByRole('button', { name: 'Not now' }).click();
        await expect(offer).toHaveCount(0);
        await expect(image).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');
        expect(made).toHaveLength(4);

        // It survives a reload, and is still only on the Character page.
        await page.reload();
        await expect(page.getByRole('region', { name: 'Character 1' }).getByRole('img', { name: 'Reference image of Mira' })).toBeVisible();

        // Never in play: not on the home screen, the Chat list, or in a Chat.
        const chat = await request.post(`/api/stories/${storyId}/chats`);
        expect(chat.ok()).toBe(true);
        const chatId = (await chat.json()).id as number;
        for (const url of ['/', `/stories/${storyId}/chats`, `/stories/${storyId}/chats/${chatId}`]) {
            await page.goto(url);
            await expect(page.getByRole('main')).toBeVisible();
            await expect(page.locator('img[src*="reference-images"]')).toHaveCount(0);
            await expect(page.getByRole('img', { name: /Reference image/ })).toHaveCount(0);
        }
        await expect(page.getByRole('article', { name: 'Opening' })).toContainText('The lamp went out an hour ago.');
    } finally {
        // Leaves the shared e2e database as it was found, Chats and the image file included.
        await request.delete(`/api/stories/${storyId}`);
        await request.delete(FAKE);
    }
});

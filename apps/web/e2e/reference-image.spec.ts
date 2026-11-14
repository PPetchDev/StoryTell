import { APIRequestContext, expect, test } from '@playwright/test';

import { openCard } from './harness/editor';

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

test('generates 3 candidates, picks one, and sees the Reference image on the Character page, and in play only as the Portrait', async ({
    page,
    request,
}) => {
    const { storyId, characterId } = await createStoryWithMira(request);
    await request.delete(FAKE);
    // Three scripted images, one per candidate; the fake's default 1x1 PNG is enough to see them load.
    const scripted = await request.post(`${FAKE}/image`, { data: { kind: 'reference_image', replies: [{}, {}, {}] } });
    expect(scripted.status()).toBe(204);

    try {
        await page.goto(`/stories/${storyId}?tab=characters`);
        // Character cards start folded.
        const mira = await openCard(page, 'Character 1');
        await expect(mira.getByRole('img', { name: 'Reference image of Mira' })).toHaveCount(0);

        await mira.getByRole('button', { name: 'Generate Reference image' }).click();
        const candidates = mira.getByRole('group', { name: 'Reference image candidates for Mira' });
        await expect(candidates.getByRole('img')).toHaveCount(3);
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

        // Three reference_image calls, drawn from the Appearance in the Story's Image style.
        const calls = await (await request.get(`${FAKE}/calls`)).json();
        const made = calls.calls.filter(
            (call: { method: string; request?: { kind: string } }) =>
                call.method === 'generateImage' && call.request?.kind === 'reference_image',
        );
        expect(made).toHaveLength(3);
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
        expect(made).toHaveLength(3);

        // It survives a reload.
        await page.reload();
        await expect(page.getByRole('region', { name: 'Character 1' }).getByRole('img', { name: 'Reference image of Mira' })).toBeVisible();

        // Not on the home screen or the Chat list; in a Chat only as the Portrait beside Mira's lines.
        await request.patch(`/api/stories/${storyId}`, { data: { opening: 'The lamp went out an hour ago.\n\n@Mira: Boots off.' } });
        const chat = await request.post(`/api/stories/${storyId}/chats`);
        expect(chat.ok()).toBe(true);
        const chatId = (await chat.json()).id as number;
        for (const url of ['/', `/stories/${storyId}/chats`]) {
            await page.goto(url);
            await expect(page.getByRole('main')).toBeVisible();
            await expect(page.locator('img[src*="reference-images"]')).toHaveCount(0);
        }
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const opening = page.getByRole('article', { name: 'Opening' });
        await expect(opening).toContainText('The lamp went out an hour ago.');
        await expect(opening.getByRole('group', { name: 'Mira' }).locator('img[src*="reference-images"]')).toHaveCount(1);
        // Beside the Dashboard at a glance's own Portrait of her on a wide screen, nowhere else.
        await expect(page.locator('img[src*="reference-images"]:not(.chat-glance img)')).toHaveCount(1);
        await expect(page.getByRole('img', { name: /Reference image/ })).toHaveCount(0);
    } finally {
        // Leaves the shared e2e database as it was found, Chats and the image file included.
        await request.delete(`/api/stories/${storyId}`);
        await request.delete(FAKE);
    }
});

test('picks the face for the chat picture, which the Chat then shows, and Reset goes back to the guess', async ({ page, request }) => {
    const { storyId, characterId } = await createStoryWithMira(request);
    await request.delete(FAKE);
    await request.post(`${FAKE}/image`, { data: { kind: 'reference_image', replies: [{}, {}, {}] } });
    const round = await (await request.post(`/api/stories/${storyId}/characters/${characterId}/reference-image/candidates`)).json();
    await request.put(`/api/stories/${storyId}/characters/${characterId}/reference-image`, {
        data: { candidateId: round.candidates[0].id },
    });

    try {
        await page.goto(`/stories/${storyId}?tab=characters`);
        // Character cards start folded.
        await openCard(page, 'Character 1');
        const picture = page.getByRole('group', { name: 'Chat picture of Mira' });
        await expect(picture).toContainText('A guess at the face');
        await picture.getByRole('button', { name: 'Pick the face' }).click();

        const sheet = page.getByRole('dialog', { name: 'Chat picture of Mira' });
        // Two sliders move the square, one direction each (audit M44): three steps across, two down,
        // of 1% of the width each. A slider's value goes up with ArrowRight.
        const across = sheet.getByRole('slider', { name: 'Across' });
        const down = sheet.getByRole('slider', { name: 'Down' });
        await expect(across).toBeVisible();
        for (let step = 0; step < 3; step += 1) await across.press('ArrowRight');
        for (let step = 0; step < 2; step += 1) await down.press('ArrowRight');
        await expect(down).toHaveAttribute('aria-valuetext', /% down$/);
        await sheet.getByRole('button', { name: 'Use this picture' }).click();
        await expect(sheet).toHaveCount(0);
        await expect(picture).toContainText('The face you picked.');

        let story = await (await request.get(`/api/stories/${storyId}`)).json();
        const crop = story.characters[0].portraitCrop;
        expect(crop.size).toBeCloseTo(0.4);
        expect(crop.x).toBeCloseTo(0.33);
        expect(crop.y).toBeCloseTo(0.05);

        // Reset clears it.
        await picture.getByRole('button', { name: 'Reset' }).click();
        await expect(picture).toContainText('A guess at the face');
        story = await (await request.get(`/api/stories/${storyId}`)).json();
        expect(story.characters[0].portraitCrop).toBeNull();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
        await request.delete(FAKE);
    }
});

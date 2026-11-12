import { APIRequestContext, expect, test } from '@playwright/test';

// The Chat is read on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** The fake gateway's control routes, reached through the Next.js /api proxy. */
const FAKE = '/api/testing/fake-gateway';

/**
 * A playable Story whose Opening has Mira (with a Reference image, and Secrets and Arc
 * directions that the profile must not show) and Kai (with no Reference image) speaking,
 * and one Chat of it.
 */
async function createStoryAndChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', {
        data: {
            title: 'The Lighthouse',
            setting: 'A lighthouse on a storm-cut island, 1890s.',
            opening: 'The door bangs open.\n\n@Mira: Boots off.\n\n@Kai: Welcome, keeper!',
        },
    });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, {
        data: { name: 'Ash', description: 'The new keeper, arrived this morning.' },
    });
    const mira = await request.post(`/api/stories/${storyId}/characters`, {
        data: {
            name: 'Mira',
            appearance: 'Tall, grey-green eyes, black hair tied back.',
            personality: 'Guarded and dry.',
            voice: 'Short sentences.',
            background: 'Kept the lamp alone for six winters.',
            secrets: 'She put the lamp out herself.',
            arcDirections: 'Comes to trust the new keeper.',
        },
    });
    expect(mira.ok()).toBe(true);
    const miraId = (await mira.json()).characters[0].id as number;
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Kai', appearance: 'Freckled, quick.', personality: 'Cheerful.', voice: 'Talks too much.' },
    });

    await request.delete(FAKE);
    await request.post(`${FAKE}/image`, { data: { kind: 'reference_image', replies: [{}, {}, {}] } });
    const round = await (await request.post(`/api/stories/${storyId}/characters/${miraId}/reference-image/candidates`)).json();
    const picked = await request.put(`/api/stories/${storyId}/characters/${miraId}/reference-image`, {
        data: { candidateId: round.candidates[0].id },
    });
    expect(picked.ok()).toBe(true);

    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

test("a tap on a Character's picture opens their profile, which closes again", async ({ page, request }) => {
    const { storyId, chatId } = await createStoryAndChat(request);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const opening = page.getByRole('article', { name: 'Opening' });
        await expect(opening).toContainText('Boots off.');

        // Mira's picture opens her profile: the whole Reference image, and what the story lets show.
        const miraPicture = opening.getByRole('button', { name: 'Profile of Mira' });
        await miraPicture.tap();
        const profile = page.getByRole('dialog', { name: 'Mira' });
        await expect(profile).toBeVisible();
        await expect(profile.getByRole('img', { name: 'Reference image of Mira' })).toBeVisible();
        await expect(profile.getByRole('heading', { name: 'Mira' })).toBeVisible();
        for (const text of ['Tall, grey-green eyes, black hair tied back.', 'Guarded and dry.', 'Short sentences.', 'Kept the lamp alone for six winters.']) {
            await expect(profile).toContainText(text);
        }
        // Secrets and Arc directions would give the story away.
        await expect(profile).not.toContainText('She put the lamp out herself.');
        await expect(profile).not.toContainText('Comes to trust the new keeper.');

        // Focus stays inside while it is open, and the Close button closes it, handing focus back.
        await expect(profile).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(profile.getByRole('button', { name: 'Close' })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(profile.getByRole('button', { name: 'Close' })).toBeFocused();
        await profile.getByRole('button', { name: 'Close' }).tap();
        await expect(profile).toHaveCount(0);
        await expect(miraPicture).toBeFocused();

        // Kai has no Reference image: his initial shows, and his profile still opens. A tap outside closes it.
        const kaiPicture = opening.getByRole('button', { name: 'Profile of Kai' });
        await expect(kaiPicture).toHaveText('K');
        await kaiPicture.tap();
        const kai = page.getByRole('dialog', { name: 'Kai' });
        await expect(kai).toContainText('Freckled, quick.');
        await expect(kai.getByRole('img')).toHaveCount(0);
        await page.touchscreen.tap(195, 20);
        await expect(kai).toHaveCount(0);

        // Escape closes it too.
        await kaiPicture.tap();
        await expect(kai).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(kai).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
        await request.delete(FAKE);
    }
});

test("the user's own lines have no profile to open", async ({ page, request }) => {
    const { storyId, chatId } = await createStoryAndChat(request);
    await request.post(`${FAKE}/text`, { data: { kind: 'turn', replies: [{ text: '@Mira: You again.', model: 'glm-5.3' }] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: ['{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}'] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: ['{"operations":[]}'] } });
    const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I wave.' } });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const line = page.getByRole('article').filter({ hasText: 'I wave.' });
        await expect(line).toBeVisible();
        await expect(line.getByRole('button', { name: /^Profile of/ })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
        await request.delete(FAKE);
    }
    expect(sent.ok()).toBe(true);
});

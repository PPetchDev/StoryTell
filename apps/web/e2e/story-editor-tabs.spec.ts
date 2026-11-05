import { APIRequestContext, expect, test } from '@playwright/test';

// The editor is used on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** A Story made through the API: playable, except a second Scene still missing its goal. */
async function createStory(request: APIRequestContext, opening = 'The lamp went out an hour ago.'): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening },
    });
    await request.patch(`/api/stories/${storyId}/role`, {
        data: { name: 'Ash', description: 'The new keeper, arrived this morning.' },
    });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.post(`/api/stories/${storyId}/scenes`, {
        data: { name: 'Arrival', situation: 'Reach the lamp room.', moveOnCondition: 'Once Mira lets you up the stairs.' },
    });
    await request.post(`/api/stories/${storyId}/scenes`, { data: { name: 'The lamp' } });
    return storyId;
}

test('a missing Scene goal: its item lands on the field in the Scenes tab, and filling it enables Play', async ({
    page,
    request,
}) => {
    const storyId = await createStory(request);
    try {
        await page.goto(`/stories/${storyId}`);
        const play = page.getByRole('button', { name: 'Play', exact: true });
        await expect(play).toBeDisabled();
        await expect(page.getByRole('tab', { name: 'Story', exact: true })).toHaveAttribute('aria-selected', 'true');
        // Only the Scenes tab has a missing field, and says so.
        await expect(page.getByRole('tab', { name: 'Scenes, has missing fields' })).toBeVisible();
        await expect(page.getByRole('tab', { name: 'Characters', exact: true })).toBeVisible();

        const status = page.getByRole('region', { name: 'Playable status' });
        await expect(status).toContainText('1 to fill in before you can play');
        await status.getByRole('button', { name: 'The lamp: Situation' }).click();

        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}\\?tab=scenes$`));
        await expect(page.getByRole('tab', { name: /^Scenes/ })).toHaveAttribute('aria-selected', 'true');
        const scene2 = page.getByRole('region', { name: 'Scene 2' });
        const goal = scene2.getByLabel('Situation / goal');
        await expect(goal).toBeFocused();
        await expect(goal).toBeInViewport();
        await expect(scene2.getByText('Needed to play')).toBeVisible();

        // The tab is kept in the URL: a reload comes back to it.
        await page.reload();
        await expect(page.getByRole('tab', { name: /^Scenes/ })).toHaveAttribute('aria-selected', 'true');

        await page.getByRole('region', { name: 'Scene 2' }).getByLabel('Situation / goal').fill('Light it.');
        await expect(play).toBeEnabled();
        await expect(page.getByRole('tab', { name: 'Scenes', exact: true })).toBeVisible();
        await expect(status).toContainText('Playable');
        await expect(page.getByRole('region', { name: 'Scene 2' }).getByText('Needed to play')).toHaveCount(0);
        await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');

        await play.click();
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats$`));
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Opening preview shows the narration and named speech as a Chat would, with Play', async ({ page, request }) => {
    const storyId = await createStory(request, 'Rain hammers the glass.\n\n@Mira: Who let you up here?');
    try {
        await page.goto(`/stories/${storyId}`);
        const opening = page.getByRole('region', { name: 'Story' }).getByLabel('Opening');
        await opening.fill('Rain hammers the glass.\n\n@mira: Who let you up here?\n\nThe lamp gutters.');
        await page.getByRole('button', { name: 'Preview the Opening' }).click();

        const preview = page.getByRole('dialog', { name: 'Opening preview' });
        await expect(preview.getByText('Rain hammers the glass.')).toBeVisible();
        await expect(preview.getByText('The lamp gutters.')).toBeVisible();
        const speech = preview.getByRole('group', { name: 'Mira' });
        await expect(speech).toContainText('Who let you up here?');
        // The Story still misses a Scene goal, so the sheet's Play waits for it.
        await expect(preview.getByRole('button', { name: /Play/ })).toBeDisabled();

        await preview.getByRole('button', { name: 'Close' }).click();
        await expect(preview).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a 12-line Opening is fully visible without scrolling inside its box', async ({ page, request }) => {
    const storyId = await createStory(request);
    const twelve = Array.from({ length: 12 }, (_, n) => `Line ${n + 1} of the Opening.`).join('\n');
    try {
        await page.goto(`/stories/${storyId}`);
        const opening = page.getByRole('region', { name: 'Story' }).getByLabel('Opening');
        await opening.fill(twelve);
        await expect
            .poll(() => opening.evaluate((box: HTMLTextAreaElement) => box.scrollHeight - box.clientHeight))
            .toBeLessThanOrEqual(0);
        await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');

        // Also when it loads that long.
        await page.reload();
        const reloaded = page.getByRole('region', { name: 'Story' }).getByLabel('Opening');
        await expect(reloaded).toHaveValue(twelve);
        await expect
            .poll(() => reloaded.evaluate((box: HTMLTextAreaElement) => box.scrollHeight - box.clientHeight))
            .toBeLessThanOrEqual(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

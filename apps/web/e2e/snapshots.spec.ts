import { APIRequestContext, expect, test } from '@playwright/test';

const FAKE = '/api/testing/fake-gateway';
const OPENING = 'Rain hammers the gallery windows.\n\n@Mira: Boots off, keeper.';

/** A playable Story with one Character and a Chat on its Opening, made through the API. */
async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse', imageStyle: 'ink wash, muted' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey-green eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

test('takes a Snapshot, sees the placeholder and then the image, resets, and finds it in the Gallery as from an earlier version', async ({
    page,
    request,
}) => {
    await request.delete(FAKE);
    const { storyId, chatId } = await createChat(request);
    await request.post(`${FAKE}/text`, {
        data: { kind: 'snapshot_prompt', replies: [JSON.stringify({ in_frame: ['Mira'], scene: 'Mira by the window in an oilskin coat.' })] },
    });
    // Held back long enough to see the placeholder; the fake's 1x1 PNG is enough to see it load.
    await request.post(`${FAKE}/image`, { data: { kind: 'snapshot_image', replies: [{ delayMs: 1_500 }] } });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const opening = page.getByRole('article', { name: 'Opening' });
        await expect(opening).toContainText('Boots off, keeper.');

        await page.getByRole('textbox', { name: 'Snapshot hint' }).fill('close-up on Mira');
        await page.getByRole('button', { name: '📷 Snapshot' }).click();

        // The placeholder shows under the Message while play could go on, then the image replaces it.
        const placeholder = page.getByRole('status', { name: 'Snapshot being made' });
        await expect(placeholder).toBeVisible();
        const thumb = page.getByRole('region', { name: 'Messages' }).getByRole('img', { name: 'Snapshot with Mira' });
        await expect(thumb).toBeVisible({ timeout: 10_000 });
        await expect(placeholder).toHaveCount(0);
        await expect(thumb).toHaveAttribute('src', /^\/api\/images\/snapshots\/story-\d+\/chat-\d+-[0-9a-f]+\.png$/);
        await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
        // Shown whole in the thread, never cropped.
        await expect(thumb).toHaveCSS('object-fit', 'contain');

        // Full screen, with the prompt it was drawn from.
        await thumb.click();
        const viewer = page.getByRole('dialog', { name: 'Snapshot' });
        await viewer.getByRole('button', { name: 'Show prompt' }).click();
        await expect(viewer.getByLabel('Prompt used')).toContainText('First-person view through the eyes of Ash');
        await expect(viewer.getByLabel('Prompt used')).toContainText('Appearance: Tall, grey-green eyes.');
        await viewer.getByRole('button', { name: 'Close' }).click();

        // Reset takes the Message away; the Snapshot leaves the timeline.
        await page.getByRole('button', { name: 'Reset' }).click();
        await page.getByRole('group', { name: /start this Chat over/ }).getByRole('button', { name: 'Reset' }).click();
        await expect(thumb).toHaveCount(0);

        // The Gallery keeps it, marked as from an earlier version of this Chat.
        await page.getByRole('link', { name: 'Gallery' }).click();
        await expect(page.getByRole('heading', { name: /Gallery/ })).toBeVisible();
        const gallery = page.getByRole('list', { name: 'Gallery' });
        await expect(gallery.getByRole('listitem')).toHaveCount(1);
        await expect(gallery).toContainText('From an earlier version of this Chat');
        await expect(gallery).toContainText('Chat 1');
        await gallery.getByRole('img', { name: 'Snapshot with Mira' }).click();
        await expect(page.getByRole('dialog', { name: 'Snapshot' })).toContainText('From an earlier version of this Chat.');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

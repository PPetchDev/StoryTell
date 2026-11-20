import { expect, Page, test } from '@playwright/test';

import { openCard } from './harness/editor';

// Uploading a Reference image (.scratch/reference-upload/spec.md), on a 360px phone: the author
// picks a picture of their own on the Character card, and it becomes the Reference image.
test.use({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });

/** A real picture, drawn in the page: the browser must be able to show it and the API to make its thumbnail. */
async function photo(page: Page): Promise<Buffer> {
    const dataUrl = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 900;
        const context = canvas.getContext('2d')!;
        const gradient = context.createLinearGradient(0, 0, 600, 900);
        gradient.addColorStop(0, '#f6c6d8');
        gradient.addColorStop(1, '#1d2a5a');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 600, 900);
        return canvas.toDataURL('image/png');
    });
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

test("the author uploads a picture as a Character's Reference image on the Characters tab", async ({ page, request }) => {
    const created = await request.post('/api/stories', { data: { title: 'The Moonwood', setting: 'A silver forest.', opening: '@Odile: Welcome.' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Odile', appearance: 'Pink hair, a silver crown.' } });
    try {
        await page.goto(`/stories/${storyId}?tab=characters`);
        const odile = await openCard(page, 'Character 1');
        await expect(odile.getByRole('img', { name: 'Reference image of Odile' })).toHaveCount(0);
        await expect(odile.getByRole('button', { name: 'Upload a picture of Odile' })).toBeVisible();

        await odile.getByLabel('Picture file for Odile').setInputFiles({ name: 'odile.png', mimeType: 'image/png', buffer: await photo(page) });
        const image = odile.getByRole('img', { name: 'Reference image of Odile' });
        await expect(image).toBeVisible();
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
        await expect(odile.getByRole('button', { name: 'Pick the face' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

        const story = await (await request.get(`/api/stories/${storyId}`)).json();
        expect(story.characters[0].referenceImagePath).toMatch(/^reference-images\/story-\d+\/character-\d+-[0-9a-f]+\./);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

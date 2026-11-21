import { expect, Page, test } from '@playwright/test';

import { openCard } from './harness/editor';

// .scratch/places-ahead/spec.md: the Story editor's Places card, on a phone. A Place is added,
// described and drawn ahead, day first; evening waits for day; a Lore entry adds one; it fits 360
// and 320 with no sideways scroll.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';

const madeStories: number[] = [];

test.afterEach(async ({ request }) => {
    while (madeStories.length > 0) await request.delete(`/api/stories/${madeStories.pop()}`);
    await request.delete(FAKE);
});

/** A small PNG drawn by the browser, in one colour. */
async function picture(page: Page, colour: string): Promise<string> {
    const dataUrl = await page.evaluate((fill) => {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext('2d')!;
        context.fillStyle = fill;
        context.fillRect(0, 0, 320, 180);
        return canvas.toDataURL('image/png');
    }, colour);
    return dataUrl.split(',')[1];
}

test('a Place is added, described and drawn ahead: day first, evening after it; one comes from Lore; the card fits a phone', async ({ page, request }) => {
    await page.goto('/settings');
    const storyId = (await (await request.post('/api/stories', { data: { title: 'The Moonwood' } })).json()).id as number;
    madeStories.push(storyId);
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A silver forest.' } });
    expect((await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'The Lunar Cathedral', text: 'Where the Rite is held.' } })).ok()).toBe(true);

    await page.goto(`/stories/${storyId}?tab=style`);
    const card = await openCard(page, 'Places');
    await card.getByRole('textbox', { name: 'New place' }).fill("Rin's tree-house");
    await card.getByRole('button', { name: 'Add' }).click();
    const place = card.getByRole('listitem', { name: "Rin's tree-house" });
    await expect(place.getByRole('textbox', { name: 'Name' })).toHaveValue("Rin's tree-house");

    await place.getByRole('textbox', { name: 'How it looks' }).fill('Round windows, moss on the sills.');
    await place.getByRole('textbox', { name: 'Name' }).click();
    await expect.poll(async () => (await (await request.get(`/api/stories/${storyId}/places`)).json()).places[0].looks).toBe('Round windows, moss on the sills.');

    // Evening waits for day.
    await expect(place.getByRole('button', { name: "Draw Rin's tree-house, evening" })).toBeDisabled();
    await request.post(`${FAKE}/image`, { data: { kind: 'place_picture', replies: [{ imageBase64: await picture(page, '#3a6b4c'), mimeType: 'image/png' }] } });
    await place.getByRole('button', { name: "Draw Rin's tree-house, day" }).click();
    await expect(place.getByRole('img', { name: "Rin's tree-house, day" })).toBeVisible();
    await expect(place.getByRole('button', { name: "Draw Rin's tree-house again, day" })).toBeVisible();
    await expect(place.getByRole('button', { name: "Draw Rin's tree-house, evening" })).toBeEnabled();

    // One from Lore.
    await card.getByRole('combobox', { name: 'Or add one from Lore' }).selectOption('The Lunar Cathedral');
    await expect(card.getByRole('listitem', { name: 'The Lunar Cathedral' })).toBeVisible();
    await expect(card.getByRole('combobox', { name: 'Or add one from Lore' })).toHaveCount(0);

    // A name the Story has is refused, and says why.
    await card.getByRole('textbox', { name: 'New place' }).fill("RIN'S TREE-HOUSE");
    await card.getByRole('button', { name: 'Add' }).click();
    await expect(card.getByRole('alert')).toContainText('already');

    for (const width of [360, 320]) {
        await page.setViewportSize({ width, height: 740 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        const box = (await place.boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    }
    await page.setViewportSize({ width: 390, height: 844 });

    // Remove takes it and its pictures.
    await place.getByRole('button', { name: "Remove the Place Rin's tree-house" }).click();
    await card.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(card.getByRole('listitem', { name: "Rin's tree-house" })).toHaveCount(0);
});

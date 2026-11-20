import { expect, Page, test } from '@playwright/test';

// Role image (.scratch/role-image/spec.md), on a 360px phone: the Role gets a picture on the Role
// tab, and the user's lines in a Chat written as the Role show it in place of the initial.
test.use({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });

const NO_OPS = '{"operations":[]}';
const NO_CHANGE = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'nothing yet' } });

/** A real picture, drawn in the page: the browser must be able to show it and the API to make its thumbnail. */
async function photo(page: Page): Promise<Buffer> {
    const dataUrl = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 800;
        const context = canvas.getContext('2d')!;
        const gradient = context.createLinearGradient(0, 0, 600, 800);
        gradient.addColorStop(0, '#e9eef5');
        gradient.addColorStop(1, '#c0392b');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 600, 800);
        return canvas.toDataURL('image/png');
    });
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

test("the Role's picture is added on the Role tab and shows beside the user's lines written as the Role", async ({ page, request }) => {
    const created = await request.post('/api/stories', { data: { title: 'The Moonwood', setting: 'A silver forest.', opening: '@Mira: Who goes there?' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Rin', description: 'A fox reborn.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' } });
    await request.delete('/api/testing/fake-gateway');
    try {
        await page.goto(`/stories/${storyId}`);
        await page.getByRole('tab', { name: /^Role/ }).tap();
        const card = page.getByRole('region', { name: 'Role picture' });
        await expect(card.getByRole('img')).toHaveCount(0);
        await card.getByLabel('Picture for Rin').setInputFiles({ name: 'rin-west-hidden.png', mimeType: 'image/png', buffer: await photo(page) });
        const picture = card.getByRole('img', { name: 'Picture of Rin' });
        await expect(picture).toBeVisible();
        await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
        await expect(card.getByRole('button', { name: 'Change picture of Rin' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

        // A Chat written as the Role: the user's line shows the picture.
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: '@Mira: A fox?', model: 'glm-5.3' }] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        await composer.getByRole('textbox', { name: 'Write as Rin' }).fill('I wave.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('A fox?');
        const beside = page.getByRole('article', { name: 'Rin said' }).locator('[data-persona-picture]');
        await expect(beside).toBeVisible();
        await expect.poll(() => beside.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

        // Removed on the Role tab: the initial is back in the Chat.
        await page.goto(`/stories/${storyId}`);
        await page.getByRole('tab', { name: /^Role/ }).tap();
        await card.getByRole('button', { name: 'Remove picture of Rin' }).tap();
        await page.getByRole('group', { name: 'Remove the picture?' }).getByRole('button', { name: 'Remove' }).tap();
        await expect(card.getByRole('img')).toHaveCount(0);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(page.getByRole('article', { name: 'Rin said' })).toBeVisible();
        await expect(page.getByRole('article', { name: 'Rin said' }).locator('[data-persona-picture]')).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

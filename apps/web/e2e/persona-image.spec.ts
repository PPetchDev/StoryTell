import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Persona image (.scratch/persona-image/spec.md), on a phone: a Persona gets a picture on the
// Personas page, and the user's lines in a Chat that wears it show the picture in place of the
// initial; removing the picture brings the initial back.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

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
        gradient.addColorStop(0, '#1d3a4f');
        gradient.addColorStop(1, '#ffc46b');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 600, 800);
        return canvas.toDataURL('image/png');
    });
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse', setting: 'A lighthouse on a storm-cut island.', opening: '@Mira: Boots off, keeper.' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

const personaOf = async (request: APIRequestContext, personaId: number) => (await request.get(`/api/personas/${personaId}`)).json();

test("a Persona's picture is added on the Personas page, shows beside the user's lines in a Chat that wears it, and goes when removed", async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    const persona = await (await request.post('/api/personas', { data: { name: 'Rin of the Reef', description: 'A wrecker turned keeper.' } })).json();
    await request.delete('/api/testing/fake-gateway');
    try {
        await page.goto('/personas');
        const card = page.getByRole('list', { name: 'Personas' }).getByRole('listitem', { name: 'Rin of the Reef' });
        // Without a picture: no image, and one button.
        await expect(card.getByRole('img')).toHaveCount(0);
        await expect(card.getByRole('button', { name: 'Add a picture of Rin of the Reef' })).toBeVisible();
        await expect(card).toContainText('Shown beside your lines in a Chat that wears this Persona.');

        await card.getByLabel('Picture for Rin of the Reef').setInputFiles({ name: 'IMG_0412.png', mimeType: 'image/png', buffer: await photo(page) });
        const picture = card.getByRole('img', { name: 'Picture of Rin of the Reef' });
        await expect(picture).toBeVisible();
        await expect.poll(() => picture.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
        await expect(card.getByRole('button', { name: 'Change picture of Rin of the Reef' })).toBeVisible();
        await expect(card.getByRole('button', { name: 'Remove picture of Rin of the Reef' })).toBeVisible();
        const imagePath = (await personaOf(request, persona.id)).imagePath as string;
        expect(imagePath).toMatch(new RegExp(`^personas/persona-${persona.id}/picture-[0-9a-f]+\\.`));
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

        // It is still there after a reload, and a rename keeps it.
        await page.reload();
        await expect(card.getByRole('img', { name: 'Picture of Rin of the Reef' })).toBeVisible();

        // A Chat that wears the Persona: the user's line shows the picture, the Character's line is as it was.
        await request.put(`/api/stories/${storyId}/chats/${chatId}/identity`, { data: { personaId: persona.id } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: '@Mira: Mind the oil.', model: 'glm-5.3' }] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        await composer.getByRole('textbox', { name: 'Write as Rin of the Reef' }).fill('I follow her up.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Mind the oil.');
        const mine = page.getByRole('article', { name: 'Rin of the Reef said' });
        const beside = mine.locator('[data-persona-picture]');
        await expect(beside).toBeVisible();
        await expect.poll(() => beside.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
        expect(await beside.getAttribute('src')).toBe(`/api/images/${imagePath}?w=320`);
        // Round and the size of a Character's picture beside a line.
        const box = (await beside.boundingBox())!;
        expect(Math.round(box.width)).toBe(36);
        expect(Math.round(box.height)).toBe(36);

        // Removed on the Personas page: the file is gone, and the Chat shows the initial again.
        await page.goto('/personas');
        await card.getByRole('button', { name: 'Remove picture of Rin of the Reef' }).tap();
        await page.getByRole('group', { name: 'Remove the picture?' }).getByRole('button', { name: 'Remove' }).tap();
        await expect(card.getByRole('img')).toHaveCount(0);
        await expect(card.getByRole('button', { name: 'Add a picture of Rin of the Reef' })).toBeVisible();
        expect((await personaOf(request, persona.id)).imagePath).toBeNull();
        expect((await request.get(`/api/images/${imagePath}`)).status()).toBe(404);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(mine).toContainText('I follow her up.');
        await expect(mine.locator('[data-persona-picture]')).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
        await request.delete(`/api/personas/${persona.id}`);
    }
});

test('a file that is not a picture is refused with the reason, and the Persona keeps what it had', async ({ page, request }) => {
    const persona = await (await request.post('/api/personas', { data: { name: 'Sable', description: '' } })).json();
    try {
        await page.goto('/personas');
        const card = page.getByRole('list', { name: 'Personas' }).getByRole('listitem', { name: 'Sable' });
        await card.getByLabel('Picture for Sable').setInputFiles({ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('just some text') });
        await expect(card.getByRole('alert')).toBeVisible();
        await expect(card.getByRole('img')).toHaveCount(0);
        expect((await personaOf(request, persona.id)).imagePath).toBeNull();
    } finally {
        await request.delete(`/api/personas/${persona.id}`);
    }
});

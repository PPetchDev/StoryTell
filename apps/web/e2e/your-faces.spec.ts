import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Your faces (.scratch/your-faces/spec.md), on a phone: 390px wide, with touch; the composer measured at 360 and 320 too.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const OPENING = 'The lanterns sway.\n\n@Mira: You came.';
const STAYS = '{"bond_changes":[],"arc_steps":[],"scene":{"reason":"Not yet.","move_on":false}}';
const NO_OPS = '{"operations":[]}';

const madeStories: number[] = [];
const madePersonas: number[] = [];

test.afterEach(async ({ request }) => {
    while (madeStories.length > 0) await request.delete(`/api/stories/${madeStories.pop()}`);
    while (madePersonas.length > 0) await request.delete(`/api/personas/${madePersonas.pop()}`);
    await request.delete(FAKE);
});

const script = (request: APIRequestContext, kind: string, replies: unknown[]) => request.post(`${FAKE}/text`, { data: { kind, replies } });

/** A small PNG drawn by the browser, in one colour. */
async function picture(page: Page, colour: string): Promise<Buffer> {
    await page.goto('/manifest.webmanifest');
    const dataUrl = await page.evaluate((fill) => {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 300;
        const context = canvas.getContext('2d')!;
        context.fillStyle = fill;
        context.fillRect(0, 0, 200, 300);
        return canvas.toDataURL('image/png');
    }, colour);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** A Story whose Role, Rin, has a picture, and Mira. */
async function storyWithRin(request: APIRequestContext, page: Page): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Lantern Market' } });
    const storyId = (await created.json()).id as number;
    madeStories.push(storyId);
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lantern market at night.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Rin', description: 'A nine-tailed fox.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.' } });
    const uploaded = await request.put(`/api/stories/${storyId}/role/image`, { multipart: { image: { name: 'rin.png', mimeType: 'image/png', buffer: await picture(page, '#e8a35a') } } });
    expect(uploaded.ok()).toBe(true);
    return storyId;
}

test("the Role tab has the Role's Expressions: an upload fills its tile, and Draw is offered from the Role picture", async ({ page, request }) => {
    const storyId = await storyWithRin(request, page);
    const happy = await picture(page, '#ffc46b');

    await page.goto(`/stories/${storyId}?tab=role`);
    const faces = page.getByRole('group', { name: 'Expressions' });
    // The same 21 as a Character's (.scratch/more-faces/spec.md).
    await expect(faces.getByRole('button', { name: /^\w+ Expression, none yet$/ })).toHaveCount(21);
    // By name: a long label shows a soft hyphen where it may break (docs/ui-audit-2026-11-21.md, H2).
    const everyday = await faces
        .getByRole('list', { name: 'Everyday feelings' })
        .getByRole('button')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')!.split(' Expression')[0]));
    expect(everyday).toEqual(['Happy', 'Loving', 'Embarrassed', 'Sad', 'Angry', 'Scared', 'Surprised', 'Annoyed', 'Thinking', 'Smug', 'Determined', 'Worried', 'Hurt', 'Tired', 'Proud']);
    await faces.getByRole('button', { name: 'Happy Expression, none yet' }).tap();
    const row = faces.getByRole('group', { name: 'Happy Expression' });
    await expect(row.getByRole('button', { name: /^Draw/ })).toBeVisible();
    await row.getByLabel('Picture for Happy').setInputFiles({ name: 'happy.png', mimeType: 'image/png', buffer: happy });
    await expect(faces.getByRole('button', { name: 'Happy Expression', exact: true })).toBeVisible();
    const story = await (await request.get(`/api/stories/${storyId}`)).json();
    expect(story.role.expressions.map((one: { emotion: string }) => one.emotion)).toEqual(['joy']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('the Role picture shows its face, picked with Pick the face, which stays after a reload', async ({ page, request }) => {
    const storyId = await storyWithRin(request, page);
    await page.goto(`/stories/${storyId}?tab=role`);
    const card = page.getByRole('region', { name: 'Role picture' });
    await card.getByRole('button', { name: 'Pick the face in the picture of Rin' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Face in the picture of Rin' });
    await sheet.getByRole('slider', { name: 'Down' }).press('ArrowRight');
    await sheet.getByRole('button', { name: 'Use this picture' }).tap();
    await expect(sheet).toHaveCount(0);
    await expect.poll(async () => (await (await request.get(`/api/stories/${storyId}`)).json()).role.imageCrop).not.toBeNull();
    await page.reload();
    await expect(page.getByRole('region', { name: 'Role picture' }).getByRole('img', { name: 'Picture of Rin' })).toBeVisible();
});

test("a Persona's card has its Expressions too", async ({ page, request }) => {
    const created = await request.post('/api/personas', { data: { name: 'Rin of the Reef', description: '' } });
    const personaId = (await created.json()).id as number;
    madePersonas.push(personaId);
    const sad = await picture(page, '#5f7fd0');

    await page.goto('/personas');
    const card = page.getByRole('listitem', { name: 'Rin of the Reef' });
    const faces = card.getByRole('group', { name: 'Expressions' });
    await expect(faces.getByText('Add a picture to draw Expressions.')).toBeVisible();
    await faces.getByRole('button', { name: 'Sad Expression, none yet' }).tap();
    await faces.getByRole('group', { name: 'Sad Expression' }).getByLabel('Picture for Sad').setInputFiles({ name: 'sad.png', mimeType: 'image/png', buffer: sad });
    await expect(faces.getByRole('button', { name: 'Sad Expression', exact: true })).toBeVisible();
    const persona = await (await request.get(`/api/personas/${personaId}`)).json();
    expect(persona.expressions.map((one: { emotion: string }) => one.emotion)).toEqual(['sadness']);
});

test('the face picker sends a face with the Message, shows it beside the line, and goes after one send; it fits the phone', async ({ page, request }) => {
    const storyId = await storyWithRin(request, page);
    const blush = await request.put(`/api/stories/${storyId}/role/expressions/embarrassment`, {
        multipart: { image: { name: 'blush.png', mimeType: 'image/png', buffer: await picture(page, '#ff8fa3') } },
    });
    expect(blush.ok()).toBe(true);
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    await request.delete(FAKE);
    await script(request, 'turn', [{ text: '@Mira: You are blushing.', model: 'glm-5.3' }]);
    await script(request, 'judge', [STAYS]);
    await script(request, 'memory_extraction', [NO_OPS]);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const composer = page.getByRole('form', { name: 'Composer' });
    await composer.getByRole('button', { name: 'Pick your face for this message' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Your face' });
    await expect(sheet.getByRole('list', { name: 'Everyday feelings' }).getByRole('button')).toHaveCount(15);
    await expect(sheet.getByRole('button', { name: 'Annoyed' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Thinking' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Smug' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Embarrassed' }).locator('img')).toHaveCount(1);
    // Its own short title, the name in the words under it (docs/ui-audit-2026-11-21.md, M7).
    await expect(sheet.getByRole('heading', { name: 'Your face' })).toBeVisible();
    await expect(sheet).toContainText('The face Rin makes as you send this message.');
    // Every label whole: cut short, "Embarrassed" and "Determined" read "Embarra…" (H2).
    for (const width of [360, 320]) {
        await page.setViewportSize({ width, height: 740 });
        const cut = await page.evaluate(() =>
            Array.from(document.querySelectorAll('[role="dialog"] li button > span:last-child')).filter((label) => label.scrollWidth > label.clientWidth + 1).map((label) => label.textContent),
        );
        expect(cut).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await sheet.getByRole('button', { name: 'Embarrassed' }).tap();
    await expect(sheet).toHaveCount(0);
    const picker = composer.getByRole('button', { name: 'Your face: Embarrassed. Change it' });
    // It opens a sheet, so it says popup, not pressed (docs/ui-audit-2026-11-21.md, L2).
    await expect(picker).toHaveAttribute('aria-haspopup', 'dialog');

    for (const width of [360, 320]) {
        await page.setViewportSize({ width, height: 740 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        const box = (await picker.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    }
    await page.setViewportSize({ width: 390, height: 844 });

    const sent = page.waitForRequest((req) => req.method() === 'POST' && req.url().endsWith(`/chats/${chatId}/messages`));
    await composer.getByRole('textbox', { name: 'Write as Rin' }).fill('Hello.');
    await composer.getByRole('button', { name: 'Send' }).tap();
    expect((await sent).postDataJSON()).toMatchObject({ text: 'Hello.', face: 'embarrassment' });
    await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('You are blushing.');
    await expect(page.locator('[data-your-face="embarrassment"]')).toHaveCount(1);
    // One send only.
    await expect(composer.getByRole('button', { name: 'Pick your face for this message' })).not.toHaveAttribute('aria-pressed');
});

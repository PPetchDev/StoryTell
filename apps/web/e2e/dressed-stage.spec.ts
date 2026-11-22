import { expect, Page, test } from '@playwright/test';

// .scratch/dressed-stage/spec.md: with "Dress the stage" on, the Chat's place is drawn with no one
// in it behind the novel view's stage, and the Characters stand in the outfits the Chat has them
// in, per emotion; "Place" as the Backdrop shows it behind the thread too.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const NO_OPS = '{"operations":[]}';
const REPLY = ['The lamp gutters.', '@Nara: You came back.', '@Nara: Sit with me.'].join('\n\n');
const JUDGE = JSON.stringify({
    bond_changes: [],
    arc_steps: [],
    scene: { move_on: false, reason: 'not yet' },
    details: { place: 'Nara’s tent', outfits: [{ character: 'Nara', outfit: 'a silk robe' }] },
    time_of_day: 'night',
    expressions: [
        { line: 1, emotion: 'desire' },
        { line: 2, emotion: 'neutral' },
    ],
});

const madeStories: number[] = [];

test.afterEach(async ({ page, request }) => {
    while (madeStories.length > 0) await request.delete(`/api/stories/${madeStories.pop()}`);
    await request.delete(FAKE);
    await page.evaluate(() => localStorage.removeItem('storytell.chatView')).catch(() => {});
});

async function picture(page: Page, colour: string): Promise<string> {
    const dataUrl = await page.evaluate((fill) => {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 300;
        const context = canvas.getContext('2d')!;
        context.fillStyle = fill;
        context.fillRect(0, 0, 200, 300);
        return canvas.toDataURL('image/png');
    }, colour);
    return dataUrl.split(',')[1];
}

test('Dress the stage draws the place behind the stage and Nara in her outfit, per emotion; Place shows it behind the thread', async ({ page, request }) => {
    await page.goto('/settings');
    const storyId = (await (await request.post('/api/stories', { data: { title: 'The Steppe' } })).json()).id as number;
    madeStories.push(storyId);
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A camp on the steppe.', opening: 'The fire is low.\n\n@Nara: Stay a while.' } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'A guest.' } });
    const made = await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Nara', appearance: 'Tall, dark hair.', personality: 'Warm.', voice: 'Low.' } });
    const naraId = ((await made.json()).characters as { id: number }[])[0].id;
    await request.post(`${FAKE}/image`, { data: { kind: 'reference_image', replies: [{}, {}, {}] } });
    const round = await (await request.post(`/api/stories/${storyId}/characters/${naraId}/reference-image/candidates`)).json();
    expect((await request.put(`/api/stories/${storyId}/characters/${naraId}/reference-image`, { data: { candidateId: round.candidates[0].id } })).ok()).toBe(true);
    // An Expression, so the Judge tags the lines.
    await request.put(`/api/stories/${storyId}/characters/${naraId}/expressions/joy`, {
        multipart: { image: { name: 'joy.png', mimeType: 'image/png', buffer: Buffer.from(await picture(page, '#ffc46b'), 'base64') } },
    });
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;

    // The switch is in the Chat menu, off by default.
    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    await page.getByRole('button', { name: 'Chat menu' }).click();
    const dress = page.getByRole('dialog', { name: 'Chat menu' }).getByRole('switch', { name: /Dress the stage/ });
    await expect(dress).toHaveAttribute('aria-checked', 'false');
    await expect(dress).toContainText('up to $1 a day');
    await dress.click();
    await expect(dress).toHaveAttribute('aria-checked', 'true');
    expect((await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).dressStage).toBe(true);
    await page.keyboard.press('Escape');

    // A turn that moves into Nara's tent at night, Nara in a silk robe, her first line Desire.
    await request.post(`${FAKE}/image`, { data: { kind: 'place_picture', replies: [{ imageBase64: await picture(page, '#203050'), mimeType: 'image/png' }] } });
    await request.post(`${FAKE}/image`, {
        data: { kind: 'outfit_sprite', replies: [{ imageBase64: await picture(page, '#e0d0b0'), mimeType: 'image/png' }, { imageBase64: await picture(page, '#c0396b'), mimeType: 'image/png' }] },
    });
    await request.post(`${FAKE}/text`, { data: { kind: 'turn', replies: [{ text: REPLY, model: 'glm-5.3' }] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: [JUDGE] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    await page.getByRole('form', { name: 'Composer' }).getByRole('textbox').fill('I missed you.');
    await page.getByRole('form', { name: 'Composer' }).getByRole('button', { name: 'Send' }).click();

    // The page looks again while the stage draws, and shows it once drawn.
    await expect.poll(async () => {
        const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
        return chat.stage ? `${chat.stage.placePicturePath !== null}/${chat.stage.outfits[0]?.sprites.length ?? 0}/${chat.stage.drawing}` : 'none';
    }, { timeout: 20_000 }).toBe('true/2/0');
    const stage = (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).stage;

    await page.getByRole('button', { name: 'Visual novel view' }).click();
    const root = page.getByRole('region', { name: 'Visual novel view' });
    const box = root.getByRole('region', { name: 'Shown line' });
    await expect(root.locator('[data-stage-place]')).toHaveAttribute('src', `/api/images/${stage.placePicturePath}?w=640`);
    await expect(box.locator('[data-line]')).toContainText('The lamp gutters.');
    await root.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(box.locator('[data-line]')).toContainText('You came back.');
    const desire = stage.outfits[0].sprites.find((sprite: { emotion: string }) => sprite.emotion === 'desire');
    const plain = stage.outfits[0].sprites.find((sprite: { emotion: string }) => sprite.emotion === 'neutral');
    await expect(root.locator('[data-stage-cutout]')).toHaveAttribute('src', `/api/images/${desire.imagePath}?w=640`);
    await root.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(box.locator('[data-line]')).toContainText('Sit with me.');
    await expect(root.locator('[data-stage-cutout]')).toHaveAttribute('src', `/api/images/${plain.imagePath}?w=640`);

    for (const width of [360, 320]) {
        await page.setViewportSize({ width, height: 740 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await expect(root.locator('[data-stage-place]')).toBeVisible();
    }

    // "Place" as the Backdrop: the same picture behind the thread.
    await request.patch(`/api/stories/${storyId}`, { data: { backdrop: 'place' } });
    await page.getByRole('button', { name: 'Visual novel view' }).click();
    await page.reload();
    await expect(page.locator('[data-backdrop] img')).toHaveAttribute('src', `/api/images/${stage.placePicturePath}`);
});

test('a whole Expression with no cut-out stands in front of the place, not behind it', async ({ page, request }) => {
    await page.goto('/settings');
    const storyId = (await (await request.post('/api/stories', { data: { title: 'The Steppe' } })).json()).id as number;
    madeStories.push(storyId);
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A camp on the steppe.', opening: 'The fire is low.\n\n@Nara: Stay a while.' } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'A guest.' } });
    const made = await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Nara', appearance: 'Tall, dark hair.', personality: 'Warm.', voice: 'Low.' } });
    const naraId = ((await made.json()).characters as { id: number }[])[0].id;
    // An uploaded Expression: an upload is never cut out, so the stage shows it whole.
    await request.put(`/api/stories/${storyId}/characters/${naraId}/expressions/joy`, {
        multipart: { image: { name: 'joy.png', mimeType: 'image/png', buffer: Buffer.from(await picture(page, '#ffc46b'), 'base64') } },
    });
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    await request.patch(`/api/stories/${storyId}/chats/${chatId}`, { data: { dressStage: true } });

    // A turn into Nara's tent, her line Joy, and no outfit to draw.
    const judge = JSON.stringify({
        bond_changes: [],
        arc_steps: [],
        scene: { move_on: false, reason: 'not yet' },
        details: { place: 'Nara’s tent', outfits: [] },
        time_of_day: 'night',
        expressions: [{ line: 1, emotion: 'joy' }],
    });
    await request.post(`${FAKE}/image`, { data: { kind: 'place_picture', replies: [{ imageBase64: await picture(page, '#203050'), mimeType: 'image/png' }] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'turn', replies: [{ text: `The lamp gutters.\n\n@Nara: You came back. ${'I kept the fire going every night, and the kettle warm, in case the wind turned and brought you home before the snow. '.repeat(3)}`, model: 'glm-5.3' }] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: [judge] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    await page.getByRole('form', { name: 'Composer' }).getByRole('textbox').fill('I missed you.');
    await page.getByRole('form', { name: 'Composer' }).getByRole('button', { name: 'Send' }).click();
    await expect.poll(async () => {
        const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
        return chat.stage ? `${chat.stage.placePicturePath !== null}/${chat.stage.drawing}` : 'none';
    }, { timeout: 20_000 }).toBe('true/0');
    await page.reload();

    await page.getByRole('button', { name: 'Visual novel view' }).click();
    const root = page.getByRole('region', { name: 'Visual novel view' });
    const box = root.getByRole('region', { name: 'Shown line' });
    await expect(box.locator('[data-line]')).toContainText('The lamp gutters.');
    await root.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(box.locator('[data-line]')).toContainText('You came back.');
    const figure = root.locator('[data-stage-picture]');
    await expect(figure).toHaveAttribute('src', /\/api\/images\/expressions\/.*joy/);
    await expect(root.locator('[data-stage-place]')).toBeVisible();
    await expect.poll(() => root.locator('[data-stage-place]').evaluate((place: HTMLImageElement) => place.complete && place.naturalWidth > 0)).toBe(true);

    // Once its fade-in is over: while it runs the figure is a layer of its own and shows on top, which
    // is why it showed for a moment and then went behind the place (2026-11-21).
    await figure.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
    // What is painted on top at the figure's middle: the place counts too (its pointer-events are off only for taps).
    const onTop = await page.evaluate(() => {
        const place = document.querySelector<HTMLElement>('[data-stage-place]')!;
        const figure = document.querySelector<HTMLElement>('[data-stage-picture]')!;
        place.style.pointerEvents = 'auto';
        const r = figure.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        place.style.pointerEvents = '';
        return hit === figure ? 'figure' : hit === place ? 'place' : (hit?.tagName ?? 'nothing');
    });
    expect(onTop).toBe('figure');

    // On a phone the picture is held to the stage's top, so a long line's box doesn't cover the face:
    // most of the drawn picture is above the box (2026-11-22).
    const shown = await page.evaluate(() => {
        const figure = document.querySelector<HTMLImageElement>('[data-stage-picture]')!;
        const r = figure.getBoundingClientRect();
        const drawn = Math.min(r.height, (r.width * figure.naturalHeight) / figure.naturalWidth);
        const top = getComputedStyle(figure).objectPosition.endsWith(' 0%') ? r.top : r.bottom - drawn;
        const boxTop = document.querySelector('[data-novel-box]')!.getBoundingClientRect().top;
        return (boxTop - top) / drawn;
    });
    expect(shown).toBeGreaterThan(0.5);
});

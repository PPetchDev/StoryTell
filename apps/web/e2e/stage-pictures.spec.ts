import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { openCard } from './harness/editor';

// .scratch/stage-pictures/spec.md: in the Visual novel view, a cut-out stands on the Backdrop from
// the knees up, moving with its emotion; an intimate line without its own picture shows the nearest
// everyday one; the Story editor lists the six intimate feelings under their own heading, with
// Draw all, and Cut out for a picture that is not cut out.

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const NO_OPS = '{"operations":[]}';
const OPENING = 'The fire is low in the tent.\n\n@Nara: Stay a while.';
const REPLY = ['She leans closer.', '@Nara: You came back.', '@Nara: I hoped you would.'].join('\n\n');
const JUDGE = JSON.stringify({
    bond_changes: [],
    arc_steps: [],
    scene: { move_on: false, reason: 'not yet' },
    expressions: [
        { line: 1, emotion: 'desire' },
        { line: 2, emotion: 'passion' },
    ],
});

const madeStories: number[] = [];

test.afterEach(async ({ page, request }) => {
    while (madeStories.length > 0) await request.delete(`/api/stories/${madeStories.pop()}`);
    await request.delete(FAKE);
    await page.evaluate(() => localStorage.removeItem('storytell.chatView')).catch(() => {});
});

/** A small PNG drawn by the browser, in one colour. */
async function picture(page: Page, colour: string): Promise<Buffer> {
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

/** A Story with Nara, her Reference image, and a Desire Expression drawn (so cut out, with the Reference image). */
async function storyWithNara(page: Page, request: APIRequestContext) {
    await page.goto('/settings');
    const created = await request.post('/api/stories', { data: { title: 'The Steppe' } });
    const storyId = (await created.json()).id as number;
    madeStories.push(storyId);
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A camp on the steppe.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'A guest.' } });
    const made = await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Nara', appearance: 'Tall, dark hair.', personality: 'Warm.', voice: 'Low.' } });
    const naraId = ((await made.json()).characters as { id: number }[])[0].id;
    await request.post(`${FAKE}/image`, { data: { kind: 'reference_image', replies: [{}, {}, {}] } });
    const round = await (await request.post(`/api/stories/${storyId}/characters/${naraId}/reference-image/candidates`)).json();
    expect((await request.put(`/api/stories/${storyId}/characters/${naraId}/reference-image`, { data: { candidateId: round.candidates[0].id } })).ok()).toBe(true);
    const desire = (await picture(page, '#c0396b')).toString('base64');
    await request.post(`${FAKE}/image`, { data: { kind: 'expression_image', replies: [{ imageBase64: desire, mimeType: 'image/png' }] } });
    await request.post(`${FAKE}/image`, { data: { kind: 'image_cutout', replies: [{ imageBase64: desire, mimeType: 'image/png' }, {}] } });
    expect((await request.post(`/api/stories/${storyId}/characters/${naraId}/expressions/desire/draw`)).ok()).toBe(true);
    return { storyId, naraId };
}

test('an intimate line stands cut out on the stage from the knees up, moving with its emotion; one without its own picture shows the nearest', async ({ page, request }) => {
    const { storyId } = await storyWithNara(page, request);
    await request.post(`${FAKE}/text`, { data: { kind: 'turn', replies: [{ text: REPLY, model: 'glm-5.3' }] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: [JUDGE] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I missed you.' } })).ok()).toBe(true);
    await expect.poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1).judge?.status).toBe('done');
    const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
    const story = await (await request.get(`/api/stories/${storyId}`)).json();
    const nara = story.characters[0];
    expect(chat.messages.at(-1).parts.filter((part: { kind: string }) => part.kind === 'speech').map((part: { emotion: string }) => part.emotion)).toEqual(['desire', 'passion']);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    await page.getByRole('button', { name: 'Visual novel view' }).click();
    const root = page.getByRole('region', { name: 'Visual novel view' });
    const box = root.getByRole('region', { name: 'Shown line' });
    const figure = root.locator('[data-stage-cutout]');

    // The view opens on the newest reply; step to Nara's first line, tagged Desire.
    await expect(box.locator('[data-line]')).toContainText('She leans closer.');
    await root.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(box.locator('[data-line]')).toContainText('You came back.');
    await expect(figure).toHaveAttribute('src', `/api/images/${nara.expressions[0].cutoutPath}?w=640`);
    await expect(figure).toHaveAttribute('data-emotion', 'desire');

    // Knee-up: the figure is taller than the stage, its top at the stage's top, cut off below.
    const stage = await figure.evaluate((element) => {
        const frame = element.closest('div')!.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return { frameTop: frame.top, frameHeight: frame.height, top: box.top, height: box.height };
    });
    expect(stage.height).toBeGreaterThan(stage.frameHeight * 1.2);
    expect(Math.abs(stage.top - stage.frameTop)).toBeLessThan(stage.frameHeight * 0.05);

    // Passion: Nara has no picture for it, so her nearest everyday one, Love, which she has not
    // either: the Reference image's cut-out.
    await root.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(box.locator('[data-line]')).toContainText('I hoped you would.');
    await expect(figure).toHaveAttribute('src', `/api/images/${nara.referenceCutoutPath}?w=640`);
    await expect(figure).toHaveAttribute('data-emotion', 'passion');

    for (const width of [360, 320]) {
        await page.setViewportSize({ width, height: 740 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await expect(figure).toBeVisible();
    }
});

test('with reduced motion the figure stands still', async ({ page, request }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { storyId } = await storyWithNara(page, request);
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    await page.getByRole('button', { name: 'Visual novel view' }).click();
    const root = page.getByRole('region', { name: 'Visual novel view' });
    // The Opening: its narration, then Nara, neutral, on the Reference image's cut-out.
    await root.getByRole('button', { name: 'Next', exact: true }).click();
    const figure = root.locator('[data-stage-cutout]');
    await expect(figure).toBeVisible();
    expect(await figure.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
});

test('the editor lists the intimate feelings under their own heading; an upload offers Cut out, which cuts it', async ({ page, request }) => {
    const { storyId } = await storyWithNara(page, request);
    await page.goto(`/stories/${storyId}?tab=characters`);
    const card = await openCard(page, 'Character 1');
    const expressions = card.getByRole('group', { name: 'Expressions' });
    await expect(expressions.getByRole('heading', { name: 'Intimate scenes (18+)' })).toBeVisible();
    const intimate = expressions.getByRole('list', { name: 'Intimate feelings' });
    await expect(intimate.getByRole('button')).toHaveCount(6);
    await expect(intimate.getByRole('button', { name: 'Desire Expression' })).toBeVisible();
    await expect(expressions.getByRole('button', { name: 'Draw all 13 Expressions of Nara' })).toBeVisible();

    // The drawn Desire is cut out: no Cut out button.
    await intimate.getByRole('button', { name: 'Desire Expression' }).click();
    const desire = expressions.getByRole('group', { name: 'Desire Expression' });
    await expect(desire).toContainText('Cut out: stands on the Backdrop in the novel view.');
    await expect(desire.getByRole('button', { name: 'Cut out Desire' })).toHaveCount(0);

    // An uploaded Teasing is not; Cut out cuts it.
    await intimate.getByRole('button', { name: 'Teasing Expression, none yet' }).click();
    const teasing = expressions.getByRole('group', { name: 'Teasing Expression' });
    await teasing.getByLabel('Picture for Teasing').setInputFiles({ name: 'teasing.png', mimeType: 'image/png', buffer: await picture(page, '#7a4cc2') });
    await expect(teasing).toContainText('Not cut out: shows with its own background in the novel view.');
    await teasing.getByRole('button', { name: 'Cut out Teasing' }).click();
    await expect(teasing).toContainText('Cut out: stands on the Backdrop in the novel view.');

    for (const width of [360, 320]) {
        await page.setViewportSize({ width, height: 740 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
});

import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Move on, and Chapters (.scratch/scene-chapters/spec.md), on a phone: 390px wide, with touch; then measured at 360 and 320.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'Smoke curls from the fire.\n\n@Nara: Drink, guest.';
const STAYS = '{"bond_changes":[],"arc_steps":[],"scene":{"reason":"Not yet.","move_on":false}}';
const NO_OPS = '{"operations":[]}';
const SUMMARY = "Ash drank the mare's milk at Nara's fire and asked nothing yet.";

const script = (request: APIRequestContext, kind: string, replies: unknown[]) => request.post('/api/testing/fake-gateway/text', { data: { kind, replies } });

/** Nara's camp with three Scenes, and a Chat one reply in. */
async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Steppe' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: "A herders' camp on the steppe.", opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'A trader passing through.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Nara', appearance: 'Tall.', personality: 'Warm and teasing.', voice: 'Quick.' } });
    await request.post(`/api/stories/${storyId}/scenes`, {
        data: { name: "Mare's milk", situation: 'Ash is a guest at the fire.', moveOnCondition: 'Ash asks where the tribe keeps its cows.' },
    });
    await request.post(`/api/stories/${storyId}/scenes`, { data: { name: 'The guest tent', situation: 'Night in the guest tent.', moveOnCondition: 'Nara tells a secret.' } });
    await request.post(`/api/stories/${storyId}/scenes`, { data: { name: 'The fire', situation: 'A lord comes to the fire.' } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;

    await script(request, 'turn', [{ text: '@Nara: Slowly. It bites.', model: 'glm-5.3' }]);
    await script(request, 'judge', [STAYS]);
    await script(request, 'memory_extraction', [NO_OPS]);
    expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I sip the milk.' } })).ok()).toBe(true);
    // The reply's Judge settles before anyone moves on.
    await expect
        .poll(async () => {
            const body = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
            return body.messages.at(-1).judge.status as string;
        })
        .toBe('done');
    return { storyId, chatId };
}

/** The sheet fits the phone: nothing wider than the screen, and Move on is a 44px target. */
async function expectFits(page: Page, sheet: Locator, width: number) {
    await page.setViewportSize({ width, height: 740 });
    await expect(sheet.getByRole('button', { name: 'Move on' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const box = (await sheet.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    for (const control of [sheet.getByRole('button', { name: 'Move on' }), sheet.getByRole('combobox', { name: 'Move on to' })]) {
        const target = (await control.boundingBox())!;
        expect(target.height).toBeGreaterThanOrEqual(44);
        expect(target.x + target.width).toBeLessThanOrEqual(width + 0.5);
    }
    // The strip keeps room for its Scene name beside its two buttons, which stay on screen.
    const strip = (await page.locator('button[aria-expanded]').filter({ has: page.locator('[data-strip-line]') }).boundingBox())!;
    expect(strip.width).toBeGreaterThan(width / 2);
    for (const name of ['Chapters', 'Hide Scene strip']) {
        const button = (await page.getByRole('button', { name, exact: true }).first().boundingBox())!;
        expect(button.width).toBeGreaterThanOrEqual(44);
        expect(button.x + button.width).toBeLessThanOrEqual(width + 0.5);
    }
}

test('Move on from the Scene strip goes to the next Scene, and the Chapter it ended is summarised and can be edited', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const { storyId, chatId } = await createChat(request);
    try {
        await script(request, 'chapter_summary', [SUMMARY]);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(page.locator('[data-strip-line]')).toContainText("Mare's milk");

        await page.getByRole('button', { name: 'Chapters', exact: true }).tap();
        const sheet = page.getByRole('dialog', { name: 'Chapters' });
        await expect(sheet.getByRole('heading', { name: "Chapter 1 · Mare's milk (now)" })).toBeVisible();
        const select = sheet.getByRole('combobox', { name: 'Move on to' });
        // The next Scene in order is chosen already.
        await expect(select).toHaveValue(/\d+/);
        await expect(select.locator('option:checked')).toHaveText('The guest tent');

        await expectFits(page, sheet, 360);
        await expectFits(page, sheet, 320);
        await page.setViewportSize({ width: 390, height: 844 });

        await sheet.getByRole('button', { name: 'Move on' }).tap();
        await expect(page.locator('[data-strip-line]')).toContainText('The guest tent');
        await expect(sheet.getByRole('heading', { name: 'Chapter 2 · The guest tent (now)' })).toBeVisible();
        const chapter = sheet.locator('[data-chapter="1"]');
        await expect(chapter.getByRole('heading', { name: "Chapter 1 · Mare's milk" })).toBeVisible();
        await expect(chapter.getByText(SUMMARY)).toBeVisible();
        await expect(chapter.getByText('You moved on')).toBeVisible();
        // The next Scene is now the one after.
        await expect(select.locator('option:checked')).toHaveText('The fire');

        await chapter.getByRole('button', { name: 'Edit Chapter 1' }).tap();
        await chapter.getByRole('textbox', { name: 'Chapter 1 summary' }).fill('Ash tasted the milk; Nara laughed at the face they made.');
        await chapter.getByRole('button', { name: 'Save' }).tap();
        await expect(chapter.getByText('Ash tasted the milk; Nara laughed at the face they made.')).toBeVisible();
        await expect(chapter.getByText('You moved on · Edited by you')).toBeVisible();

        // It reads back the same after a reload.
        await page.reload();
        await page.getByRole('button', { name: 'Chapters', exact: true }).tap();
        await expect(page.getByRole('dialog', { name: 'Chapters' }).getByText('Ash tasted the milk; Nara laughed at the face they made.')).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('with the strip hidden, the Chat menu opens the Chapters; a chosen move into free play, and a failed summary written on Try again', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const { storyId, chatId } = await createChat(request);
    try {
        await script(request, 'chapter_summary', [{ error: 'outage' }]);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Hide Scene strip' }).tap();

        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Chapters/ }).tap();
        const sheet = page.getByRole('dialog', { name: 'Chapters' });
        await sheet.getByRole('combobox', { name: 'Move on to' }).selectOption({ label: 'Free play (no Scene)' });
        await sheet.getByRole('button', { name: 'Move on' }).tap();

        await expect(sheet.getByRole('heading', { name: 'Chapter 2 · Free play (now)' })).toBeVisible();
        const chapter = sheet.locator('[data-chapter="1"]');
        await expect(chapter.getByText('Couldn’t write this one.')).toBeVisible();
        // From free play, the first Scene is offered, and free play isn't.
        await expect(sheet.getByRole('combobox', { name: 'Move on to' }).locator('option:checked')).toHaveText("Mare's milk");
        await expect(sheet.getByRole('combobox', { name: 'Move on to' }).locator('option')).toHaveText(["Mare's milk", 'The guest tent', 'The fire']);

        await script(request, 'chapter_summary', [SUMMARY]);
        await chapter.getByRole('button', { name: 'Try again' }).tap();
        await expect(chapter.getByText(SUMMARY)).toBeVisible();
        await expect(chapter.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

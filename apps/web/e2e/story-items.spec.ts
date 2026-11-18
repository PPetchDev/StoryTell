import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Items (.scratch/story-items/spec.md), on the user's 360px phone: the things that matter in a
// Chat, who has each and how it came to them, opened from the Scene strip. The user gives one to a
// Character, adds one, marks one gone and deletes one; the next turn's prompt reads who has what.
test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';
const KEY = 'the brass key';
const LANTERN = 'a storm lantern';

function judgement(extra: Record<string, unknown> = {}): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'nothing yet' }, ...extra });
}

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse', setting: 'A lighthouse on a storm-cut island.', opening: OPENING } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded.', voice: 'Short sentences.' } });
    await request.post(`/api/stories/${storyId}/scenes`, { data: { name: 'Arrival', situation: 'Reach the lamp room before the storm closes the stair.' } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    await request.patch(`/api/stories/${storyId}/chats/${chatId}`, { data: { characterThoughts: false } });
    return { storyId, chatId };
}

async function scriptTurn(request: APIRequestContext, reply: string, judge = judgement()) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [judge] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

async function lastTurnTrailing(request: APIRequestContext): Promise<string> {
    const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as {
        calls: Array<{ request: { kind?: string; messages?: Array<{ content: string }> } }>;
    };
    return calls.filter((call) => call.request?.kind === 'turn').at(-1)!.request.messages!.at(-1)!.content;
}

/** Nothing on the page is wider than the screen, and the sheet's controls sit inside it. */
async function fitsWidth(page: Page, width: number) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const sheet = page.getByRole('dialog', { name: 'Items' });
    for (const control of [...(await sheet.getByRole('button').all()), ...(await sheet.getByRole('combobox').all()), ...(await sheet.getByRole('textbox').all())]) {
        const box = await control.boundingBox();
        if (!box) continue;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
}

test('the Items sheet shows the Judge’s Item; the user gives it away, adds one, marks one gone and deletes it; the next turn reads them', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete('/api/testing/fake-gateway');
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const strip = page.getByRole('button', { name: /^Scene:/ });
        const composer = page.getByRole('form', { name: 'Composer' });

        // Closed, the strip has no Items row; opened, it says there are none yet.
        await expect(page.getByRole('button', { name: /^Items/ })).toHaveCount(0);
        await strip.tap();
        await expect(page.getByRole('button', { name: 'Items · none yet' })).toBeVisible();
        await strip.tap();

        await scriptTurn(request, '@Mira: Take the key. Don’t lose it.', judgement({ items: [{ item: KEY, holder: 'user', how: 'given by Mira', end: null }] }));
        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('I hold out my hand.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Take the key');

        // Once the Judge settles, the strip counts the Item.
        await strip.tap();
        const openItems = page.getByRole('button', { name: 'Items · 1' });
        await expect(openItems).toBeVisible({ timeout: 10_000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
        await openItems.tap();
        const sheet = page.getByRole('dialog', { name: 'Items' });
        const held = sheet.getByRole('list', { name: 'Held items' }).getByRole('listitem');
        await expect(held).toHaveCount(1);
        await expect(held.first()).toContainText(KEY);
        await expect(held.first()).toContainText('You have it');
        await expect(held.first()).toContainText('given by Mira');
        await expect(held.first()).not.toContainText('You set this');
        await fitsWidth(page, 360);

        // Give it to Mira.
        await sheet.getByRole('button', { name: `Edit ${KEY}` }).tap();
        const edit = sheet.getByRole('form', { name: `Edit ${KEY}` });
        await expect(edit.getByRole('combobox', { name: 'Who has it' })).toHaveValue('{user}');
        await edit.getByRole('combobox', { name: 'Who has it' }).selectOption('Mira');
        await edit.getByRole('textbox', { name: 'How they came by it' }).fill('handed back by Ash');
        await fitsWidth(page, 360);
        await edit.getByRole('button', { name: 'Save' }).tap();
        await expect(held.first()).toContainText('Mira has it');
        await expect(held.first()).toContainText('handed back by Ash');
        await expect(held.first()).toContainText('You set this');
        await expect(sheet.getByRole('button', { name: `Edit ${KEY}` })).toBeFocused();

        // Add one, held by someone else.
        const add = sheet.getByRole('form', { name: 'Add an item' });
        await expect(add.getByRole('button', { name: 'Add' })).toBeDisabled();
        await add.getByRole('textbox', { name: 'Item' }).fill(LANTERN);
        await add.getByRole('combobox', { name: 'Who has it' }).selectOption({ label: 'Someone or somewhere else' });
        await add.getByRole('textbox', { name: 'Who or where' }).fill('the lamp room hook');
        await add.getByRole('textbox', { name: 'How they came by it' }).fill('hung there by the old keeper');
        await add.getByRole('button', { name: 'Add' }).tap();
        await expect(held).toHaveCount(2);
        await expect(held.nth(1)).toContainText('Held by the lamp room hook');
        await expect(add.getByRole('textbox', { name: 'Item' })).toHaveValue('');

        // Escape leaves an edit without closing the sheet.
        await sheet.getByRole('button', { name: `Edit ${LANTERN}` }).tap();
        await page.keyboard.press('Escape');
        await expect(sheet).toBeVisible();
        await expect(sheet.getByRole('form', { name: `Edit ${LANTERN}` })).toHaveCount(0);

        // Mark it lost: it moves under Gone.
        await sheet.getByRole('button', { name: `Edit ${LANTERN}` }).tap();
        const lanternEdit = sheet.getByRole('form', { name: `Edit ${LANTERN}` });
        await lanternEdit.getByRole('combobox', { name: 'State' }).selectOption({ label: 'Lost' });
        await lanternEdit.getByRole('textbox', { name: 'How it ended' }).fill('blown off the gallery');
        await lanternEdit.getByRole('button', { name: 'Save' }).tap();
        await expect(held).toHaveCount(1);
        const gone = sheet.getByRole('list', { name: 'Gone items' }).getByRole('listitem');
        await expect(gone).toHaveCount(1);
        await expect(gone.first()).toContainText('Lost');
        await expect(gone.first()).toContainText('blown off the gallery');

        // At 320px it still fits, with a form open.
        await page.setViewportSize({ width: 320, height: 640 });
        await fitsWidth(page, 320);
        await sheet.getByRole('button', { name: `Edit ${LANTERN}` }).tap();
        await fitsWidth(page, 320);
        await page.setViewportSize({ width: 360, height: 780 });

        // The next reply is written knowing who has what.
        await page.keyboard.press('Escape');
        await expect(sheet.getByRole('form', { name: `Edit ${LANTERN}` })).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Items · 1' })).toBeVisible();
        await scriptTurn(request, '@Mira: Mine again, then.');
        await composer.getByRole('button', { name: 'Continue' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Mine again');
        const trailing = await lastTurnTrailing(request);
        expect(trailing).toContain(`- ${KEY}: Mira has it, handed back by Ash`);
        expect(trailing).toContain(`Gone, so no one has them: ${LANTERN} (lost, blown off the gallery)`);

        // Delete the gone one.
        await page.getByRole('button', { name: 'Items · 1' }).tap();
        await sheet.getByRole('button', { name: `Edit ${LANTERN}` }).tap();
        await sheet.getByRole('button', { name: `Delete ${LANTERN}` }).tap();
        await expect(sheet.getByRole('list', { name: 'Gone items' })).toHaveCount(0);
        await expect(held).toHaveCount(1);
    } finally {
        await request.delete('/api/testing/fake-gateway');
        await request.delete(`/api/stories/${storyId}`);
    }
});

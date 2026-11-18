import { APIRequestContext, expect, Page, test } from '@playwright/test';

// The Facts panel (.scratch/facts-panel/spec.md), on the user's 360px phone: the Chat's Established
// facts, opened from the Scene strip, which the user edits, adds to and deletes from; the next
// turn's prompt reads what they set.
test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';
const YEARS = "Mira's years on the island";

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
    for (const button of await page.getByRole('dialog', { name: 'Established facts' }).getByRole('button').all()) {
        const box = await button.boundingBox();
        if (!box) continue;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
}

test('the Facts panel shows the Judge’s facts, and the user edits, adds and deletes them; the next turn reads them', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete('/api/testing/fake-gateway');
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const strip = page.getByRole('button', { name: /^Scene:/ });
        const composer = page.getByRole('form', { name: 'Composer' });

        // Closed, the strip has no Facts row; opened, it says there are none yet.
        await expect(page.getByRole('button', { name: /^Established facts/ })).toHaveCount(0);
        await strip.tap();
        await expect(page.getByRole('button', { name: 'Established facts · none yet' })).toBeVisible();
        await strip.tap();

        await scriptTurn(request, '@Mira: Eleven years I have kept this light.', judgement({ facts: [{ topic: YEARS, fact: 'eleven years' }] }));
        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('How long have you kept it?');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Eleven years');

        // Once the Judge settles, the strip counts the fact.
        await strip.tap();
        const openFacts = page.getByRole('button', { name: 'Established facts · 1' });
        await expect(openFacts).toBeVisible({ timeout: 10_000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
        await openFacts.tap();
        const sheet = page.getByRole('dialog', { name: 'Established facts' });
        const facts = sheet.getByRole('list', { name: 'Facts' }).getByRole('listitem');
        await expect(facts).toHaveCount(1);
        await expect(facts.first()).toContainText(YEARS);
        await expect(facts.first()).toContainText('eleven years');
        await expect(facts.first()).not.toContainText('You set this');
        await fitsWidth(page, 360);

        // Edit its telling.
        await sheet.getByRole('button', { name: `Edit ${YEARS}` }).tap();
        const box = sheet.getByRole('textbox', { name: YEARS });
        await expect(box).toHaveValue('eleven years');
        await box.fill('twelve years');
        await fitsWidth(page, 360);
        await sheet.getByRole('button', { name: 'Save' }).tap();
        await expect(facts.first()).toContainText('twelve years');
        await expect(facts.first()).toContainText('You set this');
        await expect(sheet.getByRole('button', { name: `Edit ${YEARS}` })).toBeFocused();

        // Add one.
        const add = sheet.getByRole('form', { name: 'Add a fact' });
        await expect(add.getByRole('button', { name: 'Add' })).toBeDisabled();
        await add.getByRole('textbox', { name: 'Topic' }).fill("Mira's sister");
        await add.getByRole('textbox', { name: 'Fact' }).fill('Hale, who keeps the mainland light');
        await add.getByRole('button', { name: 'Add' }).tap();
        await expect(facts).toHaveCount(2);
        await expect(facts.nth(1)).toContainText('Hale, who keeps the mainland light');
        await expect(add.getByRole('textbox', { name: 'Topic' })).toHaveValue('');

        // Escape leaves an edit without closing the sheet.
        await sheet.getByRole('button', { name: "Edit Mira's sister" }).tap();
        await page.keyboard.press('Escape');
        await expect(sheet).toBeVisible();
        await expect(sheet.getByRole('textbox', { name: "Mira's sister" })).toHaveCount(0);

        // And at 320px it still fits.
        await page.setViewportSize({ width: 320, height: 640 });
        await fitsWidth(page, 320);
        await page.setViewportSize({ width: 360, height: 780 });

        // Delete it.
        await sheet.getByRole('button', { name: "Edit Mira's sister" }).tap();
        await sheet.getByRole('button', { name: "Delete Mira's sister" }).tap();
        await expect(facts).toHaveCount(1);

        // The next reply is written knowing the user's telling.
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Established facts · 1' })).toBeVisible();
        await scriptTurn(request, '@Mira: Twelve, then. Who counts.');
        await composer.getByRole('button', { name: 'Continue' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Who counts');
        const trailing = await lastTurnTrailing(request);
        expect(trailing).toContain(`- ${YEARS}: twelve years`);
        expect(trailing).not.toContain("Mira's sister");
    } finally {
        await request.delete('/api/testing/fake-gateway');
    }
});

import { expect, Locator, Page, test } from '@playwright/test';

// The composer is used on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const SUGGESTED = JSON.stringify({
    suggestions: [
        { kind: 'action', text: 'You pull your boots off and set them by the stove.' },
        { kind: 'speech', text: '"The ferry was late. So was the storm."' },
        { kind: 'move', text: 'You take the logbook from her and read the last entry aloud.' },
    ],
});

async function box(locator: Locator) {
    const found = await locator.boundingBox();
    expect(found).not.toBeNull();
    return found!;
}

/** Nothing on the page is wider than the window. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

test('the composer stacks the panel, the Character row, the tool row and the box row', async ({ page, request }) => {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'suggested_replies', replies: [SUGGESTED] } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const tools = composer.getByRole('toolbar', { name: 'Composer tools' });
        const text = composer.getByRole('textbox', { name: 'Write as Ash' });

        // ⚡ and ✱ are tools now, above the box; the box row is the box and the send slot.
        await expect(tools.getByRole('button', { name: 'Suggest replies' })).toBeVisible();
        await expect(tools.getByRole('button', { name: 'Write an action' })).toBeVisible();
        await expect(tools.getByRole('textbox')).toHaveCount(0);
        await expect(tools.getByRole('button', { name: 'Continue' })).toHaveCount(0);
        const toolRow = await box(tools);
        const boxRow = await box(text);
        expect(toolRow.y + toolRow.height).toBeLessThanOrEqual(boxRow.y + 1);

        // With ⚡ and ✱ out of its row, the box shares it only with 🎤 and the send slot
        // (.scratch/dictation/spec.md: "Box row = box · 🎤 · send slot"), and takes the rest:
        // two 2.75rem buttons and the gaps leave it about two thirds of the phone.
        const dictate = composer.getByRole('button', { name: 'Dictate' });
        const send = composer.getByRole('button', { name: 'Continue' });
        const [dictateBox, sendBox] = [await box(dictate), await box(send)];
        expect(boxRow.x + boxRow.width).toBeLessThanOrEqual(dictateBox.x);
        expect(dictateBox.x + dictateBox.width).toBeLessThanOrEqual(sendBox.x);
        expect(boxRow.width).toBeGreaterThan(390 * 0.62);

        // A one-Character Story: the Character row is there but takes no height.
        const characters = composer.locator('[data-band="characters"]');
        await expect(characters).toBeHidden();

        // The panel sits above the tool row.
        await tools.getByRole('button', { name: 'Suggest replies' }).tap();
        const cards = composer.getByRole('list', { name: 'Suggested replies' });
        await expect(cards.getByRole('button')).toHaveCount(3);
        const panel = await box(cards);
        expect(panel.y + panel.height).toBeLessThanOrEqual((await box(tools)).y + 1);

        // Nothing is wider than the phone, at 390px and at 320px.
        await expectNoSidewaysScroll(page);
        await page.setViewportSize({ width: 320, height: 640 });
        await expect(text).toBeVisible();
        await expectNoSidewaysScroll(page);
        const narrow = await box(composer);
        expect(narrow.x + narrow.width).toBeLessThanOrEqual(320);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

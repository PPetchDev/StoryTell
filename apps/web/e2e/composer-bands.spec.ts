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

        // With ⚡ and ✱ out of its row, the box shares it with 🎲 (.scratch/roll/spec.md: a sixth tool
        // would wrap the tool row on every phone), 🎤 and the send slot, and takes the rest: three
        // 2.75rem buttons and the gaps leave it a little over half of the phone.
        const dice = composer.getByRole('button', { name: 'Roll the dice for this message' });
        const dictate = composer.getByRole('button', { name: 'Dictate' });
        const send = composer.getByRole('button', { name: 'Continue' });
        const [diceBox, dictateBox, sendBox] = [await box(dice), await box(dictate), await box(send)];
        expect(boxRow.x + boxRow.width).toBeLessThanOrEqual(diceBox.x);
        expect(diceBox.x + diceBox.width).toBeLessThanOrEqual(dictateBox.x);
        expect(dictateBox.x + dictateBox.width).toBeLessThanOrEqual(sendBox.x);
        expect(boxRow.width).toBeGreaterThan(390 * 0.5);

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

// A real phone, 360px wide, wrapped the fifth tool (Cue) onto a row of its own, which took 48px
// from the Chat (2026-11-15). The tools are one row at every phone width, all of them in sight.
for (const width of [320, 360, 390, 412]) {
    test(`the five tools stay on one row, all in sight, on a ${width}px phone`, async ({ page, request }) => {
        await page.setViewportSize({ width, height: 800 });
        const created = await request.post('/api/stories', { data: { title: 'The Herd', setting: 'A summer road.', opening: OPENING } });
        expect(created.ok()).toBe(true);
        const storyId = (await created.json()).id as number;
        await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Petch', description: 'A traveller.' } });
        for (const name of ['Mira', 'Dulcie', 'Tavri', 'Morra']) {
            await request.post(`/api/stories/${storyId}/characters`, { data: { name, appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.' } });
        }
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const composer = page.getByRole('form', { name: 'Composer' });
            const tools = composer.getByRole('toolbar', { name: 'Composer tools' });
            await expect(tools.getByRole('button')).toHaveCount(5);

            // One row: every tool has the same top, and the row is one tool tall.
            const places = await tools.getByRole('button').evaluateAll((items) =>
                items.map((item) => {
                    const rect = item.getBoundingClientRect();
                    return { top: Math.round(rect.top), left: rect.left, right: rect.right, width: rect.width, height: rect.height };
                }),
            );
            expect(new Set(places.map((place) => place.top)).size).toBe(1);
            expect((await box(tools)).height).toBeLessThanOrEqual(46);
            // All in sight, none scrolled off the row's end, and each still a thumb's size.
            const row = await box(tools);
            expect(places.at(-1)!.right).toBeLessThanOrEqual(row.x + row.width + 0.5);
            expect(places[0].left).toBeGreaterThanOrEqual(row.x - 0.5);
            await expect(tools).toHaveAttribute('data-fade', 'none');
            for (const place of places) {
                expect(place.height).toBeGreaterThanOrEqual(44);
                expect(place.width).toBeGreaterThanOrEqual(44);
            }

            // The empty box is one line with its whole placeholder on it, and has no scrollbar.
            const text = composer.getByRole('textbox', { name: 'Write as Petch' });
            expect((await box(text)).height).toBeLessThanOrEqual(46);
            expect(await text.evaluate((el) => getComputedStyle(el).overflowY)).toBe('hidden');
            // It scrolls only once the text is taller than five lines.
            await text.fill(Array.from({ length: 9 }, (_, line) => `Line ${line + 1}`).join('\n'));
            expect(await text.evaluate((el) => getComputedStyle(el).overflowY)).toBe('auto');
            await text.fill('');
            expect(await text.evaluate((el) => getComputedStyle(el).overflowY)).toBe('hidden');

            // A Cue and a Roll set for the next turn share one row (docs/ui-audit-2026-11-16.md M2: a band each took 104px at 360px).
            await composer.getByRole('button', { name: 'Cue the Narrator' }).tap();
            const sheet = page.getByRole('dialog', { name: 'Cue the Narrator' });
            await sheet.getByRole('textbox', { name: 'Cue' }).fill('Make Mira angrier, and bring the herd in before the rain comes.');
            await sheet.getByRole('button', { name: 'Use for the next reply' }).tap();
            await composer.getByRole('button', { name: 'Roll the dice for this message' }).tap();
            const next = await box(composer.locator('[data-band="next"]'));
            const cueBand = await box(composer.locator('[data-band="cue"]'));
            const rollBand = await box(composer.locator('[data-band="roll"]'));
            expect(next.height).toBeLessThanOrEqual(46);
            expect(Math.round(cueBand.y)).toBe(Math.round(rollBand.y));
            expect(rollBand.x + rollBand.width).toBeLessThanOrEqual(next.x + next.width + 0.5);
            // The Roll keeps its words whole; the Cue is the one that gives way.
            await expect(composer.locator('[data-band="roll"]')).toContainText(/Roll \d+\+/);
            expect(cueBand.width).toBeGreaterThan(120);
            await expectNoSidewaysScroll(page);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
}

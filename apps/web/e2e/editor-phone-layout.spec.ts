import { APIRequestContext, expect, Locator, test } from '@playwright/test';

import { openCard } from './harness/editor';

// The Story editor on a phone (docs/ui-audit-2026-11-13.md, M9-M13): long one-line values wrap,
// the tab bar shows it scrolls, the cover heads the Story tab only, and Remove asks quietly.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const LONG_LINE = 'From the Crescent Isles I came, and to the Crescent Isles I will go when the tide turns again.';
const LONG_STYLE = 'soft watercolour, muted greens and greys, loose ink lines, paper texture, late-afternoon light';
const LONG_KEYWORDS = ['yurt', 'tents', 'felt houses', 'the round homes of the grassland', 'กระโจม'];

/** A playable Story with Mira (one long example line), a long Image style and a Lore entry with many keywords. */
async function createStory(request: APIRequestContext): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Market', imageStyle: LONG_STYLE } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A grassland market.', opening: 'Dust and bells.' } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Petch', description: 'A traveller.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.', exampleLines: [LONG_LINE] },
    });
    await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Tents', keywords: LONG_KEYWORDS, text: 'Round felt tents.' } });
    return storyId;
}

/** How many lines of text a box shows: a box that wraps is taller than one line. */
async function height(box: Locator): Promise<number> {
    return (await box.boundingBox())!.height;
}

test('long one-line values wrap in boxes the width of the card, and Enter adds no line', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        // M9: the example line has the card's width, not what three buttons left of it, and wraps.
        await page.goto(`/stories/${storyId}?tab=characters`);
        const mira = await openCard(page, 'Character 1');
        const line = mira.getByRole('textbox', { name: 'Example line 1', exact: true });
        await expect(line).toHaveValue(LONG_LINE);
        const card = (await mira.boundingBox())!;
        expect((await line.boundingBox())!.width).toBeGreaterThan(card.width * 0.8);
        expect(await height(line)).toBeGreaterThan(60);
        // Its buttons are still there, under it.
        const remove = mira.getByRole('button', { name: 'Remove example line 1' });
        expect((await remove.boundingBox())!.y).toBeGreaterThan((await line.boundingBox())!.y);
        // A line stays one line: Enter adds no break.
        await line.focus();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await expect(line).toHaveValue(LONG_LINE);

        // M10: Image style and Keywords wrap too.
        await page.getByRole('tab', { name: /^Style/ }).tap();
        const style = page.getByRole('textbox', { name: 'Image style' });
        await expect(style).toHaveValue(LONG_STYLE);
        expect(await height(style)).toBeGreaterThan(60);

        await page.getByRole('tab', { name: /^Lore/ }).tap();
        const lore = await openCard(page, 'Lore 1');
        const keywords = lore.getByRole('textbox', { name: 'Keywords', exact: true });
        await expect(keywords).toHaveValue(LONG_KEYWORDS.join(', '));
        expect(await height(keywords)).toBeGreaterThan(60);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the tab bar fades at an end that hides tabs, and the chosen tab scrolls into sight', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        await page.goto(`/stories/${storyId}`);
        const tabs = page.getByRole('tablist', { name: 'Story sections' });
        // M11: on the Story tab, more tabs wait past the right edge, and the bar says so.
        await expect(tabs).toHaveAttribute('data-fade', 'end');
        await page.getByRole('tab', { name: /^Lore/ }).tap();
        await expect(page.getByRole('tab', { name: /^Lore/ })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tab', { name: /^Lore/ })).toBeInViewport({ ratio: 1 });
        await expect(tabs).toHaveAttribute('data-fade', /^(start|both)$/);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the cover heads the Story tab only, Playable is one small line, and Remove asks quietly', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        await page.goto(`/stories/${storyId}`);
        const cover = page.getByRole('button', { name: 'Add a cover' });
        await expect(cover).toBeVisible();
        const status = page.getByRole('region', { name: 'Playable status' });
        await expect(status).toContainText('Playable');
        // M12: a badge, not a box: one short line.
        expect(await height(status)).toBeLessThan(40);

        await page.getByRole('tab', { name: /^Characters/ }).tap();
        await expect(cover).toHaveCount(0);
        await expect(status).toContainText('Playable');

        // M13: Remove is a quiet button until it asks; the confirming Remove is the danger one.
        const mira = await openCard(page, 'Character 1');
        const remove = mira.getByRole('button', { name: 'Remove Character 1' });
        const quiet = await mira.getByRole('button', { name: 'Add example line' }).evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(await remove.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(quiet);
        await remove.tap();
        const asking = mira.getByRole('group', { name: 'Remove Mira?' });
        await expect(asking).toBeVisible();
        const confirm = asking.getByRole('button', { name: 'Remove', exact: true });
        expect(await confirm.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(quiet);
        await asking.getByRole('button', { name: 'Cancel' }).tap();
        await expect(remove).toBeFocused();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

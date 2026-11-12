import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { takeSnapshot } from './harness/snapshot';

// The UI audit's fixes on Home, the Gallery, Personas and Settings (docs/ui-audit.md), on a phone:
// 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const SCENE = JSON.stringify({ in_frame: ['Mira'], scene: 'Mira by the window in an oilskin coat.' });
const BOOM = { error: { code: '500.000.000', message: 'The server tripped.' } };

/** A playable Story with one Chat and `count` finished Snapshots, made through the API. */
async function storyWithSnapshots(request: APIRequestContext, title: string, count: number): Promise<{ storyId: number; chatId: number }> {
    await request.delete(FAKE);
    await request.post(`${FAKE}/text`, { data: { kind: 'snapshot_prompt', replies: Array(count).fill(SCENE) } });
    await request.post(`${FAKE}/image`, { data: { kind: 'snapshot_image', replies: Array(count).fill({}) } });
    const storyId = (await (await request.post('/api/stories', { data: { title, imageStyle: 'ink wash' } })).json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse.', opening: 'Rain on the glass.\n\n@Mira: Boots off.' } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' } });
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    for (let i = 0; i < count; i++) {
        expect((await takeSnapshot(request, storyId, chatId, `shot ${i}`)).ok()).toBe(true);
        await expect
            .poll(async () => ((await (await request.get(`/api/stories/${storyId}/chats/${chatId}/snapshots`)).json()) as { jobs: unknown[] }).jobs.length)
            .toBe(0);
    }
    return { storyId, chatId };
}

async function focusedName(page: Page): Promise<string> {
    return page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.getAttribute('aria-label') ?? el?.id ?? el?.textContent ?? '';
    });
}

test('the viewer has ‹ › buttons that stop at the ends, and tiles load small thumbnails lazily', async ({ page, request }) => {
    const { storyId } = await storyWithSnapshots(request, `Buttons ${Date.now()}`, 2);
    try {
        await page.goto(`/stories/${storyId}/gallery`);
        const tiles = page.getByRole('list', { name: /^Snapshots of / }).getByRole('img');
        await expect(tiles).toHaveCount(2);
        // H33: a lazy, async tile, whose picture is the API's WebP thumbnail.
        await expect(tiles.first()).toHaveAttribute('loading', 'lazy');
        await expect(tiles.first()).toHaveAttribute('decoding', 'async');
        await expect.poll(() => tiles.first().evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(/\?w=(320|640)$/);
        const thumb = await request.get(await tiles.first().evaluate((img: HTMLImageElement) => new URL(img.currentSrc).pathname + new URL(img.currentSrc).search));
        expect(thumb.headers()['content-type']).toBe('image/webp');
        expect(thumb.headers()['cache-control']).toContain('immutable');

        await tiles.first().tap();
        const viewer = page.getByRole('dialog', { name: 'Snapshot' });
        const previous = viewer.getByRole('button', { name: 'Previous Snapshot' });
        const next = viewer.getByRole('button', { name: 'Next Snapshot' });
        await expect(viewer).toContainText('1 / 2');
        await expect(viewer.getByText('Snapshot 1 of 2')).toBeAttached();
        await expect(previous).toHaveAttribute('aria-disabled', 'true');
        for (const button of [previous, next]) {
            const box = (await button.boundingBox())!;
            expect(box.width).toBeGreaterThanOrEqual(44);
            expect(box.height).toBeGreaterThanOrEqual(44);
        }

        await next.tap();
        await expect(viewer).toContainText('2 / 2');
        await expect(next).toHaveAttribute('aria-disabled', 'true');
        // At the end it stays put, and keeps focus.
        await next.focus();
        await page.keyboard.press('Enter');
        await expect(viewer).toContainText('2 / 2');
        await expect(next).toBeFocused();
        await previous.tap();
        await expect(viewer).toContainText('1 / 2');

        // H24: the actions are full-size targets.
        const download = (await viewer.getByRole('link', { name: 'Download' }).boundingBox())!;
        expect(download.height).toBeGreaterThanOrEqual(44);
        // L11: Show prompt says whether the prompt is open.
        const show = viewer.getByRole('button', { name: 'Show prompt' });
        await expect(show).toHaveAttribute('aria-expanded', 'false');
        await show.tap();
        await expect(viewer.getByRole('button', { name: 'Hide prompt' })).toHaveAttribute('aria-expanded', 'true');
        await expect(viewer.getByRole('region', { name: 'Prompt used' })).toContainText('oilskin');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a picture that fails to load says so with Try again, and a failed delete keeps the viewer open', async ({ page, request }) => {
    const { storyId } = await storyWithSnapshots(request, `Failures ${Date.now()}`, 2);
    try {
        await page.goto(`/stories/${storyId}/gallery`);
        const tiles = page.getByRole('list', { name: /^Snapshots of / }).getByRole('button');
        await expect(tiles).toHaveCount(2);

        // M41: the full image fails once (thumbnails still load), then Try again shows it.
        let failImage = true;
        await page.route(/\/api\/images\/snapshots\/[^?]+$/, (route) => (failImage ? route.abort() : route.continue()));
        await tiles.first().tap();
        const viewer = page.getByRole('dialog', { name: 'Snapshot' });
        await expect(viewer.getByRole('alert')).toContainText("Couldn't load this picture.");
        failImage = false;
        await viewer.getByRole('button', { name: 'Try again' }).tap();
        await expect(viewer.getByRole('alert')).toHaveCount(0);
        await expect.poll(() => viewer.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

        // L25: the delete fails, the viewer stays with the reason.
        await page.route(/\/api\/stories\/\d+\/snapshots\/\d+$/, (route) =>
            route.request().method() === 'DELETE' ? route.fulfill({ status: 500, json: BOOM }) : route.continue(),
        );
        await viewer.getByRole('button', { name: 'Delete this Snapshot' }).tap();
        await viewer.getByRole('group', { name: /Delete this Snapshot/ }).getByRole('button', { name: 'Delete' }).tap();
        await expect(viewer.getByRole('alert')).toContainText("Couldn't delete it: The server tripped.");
        await expect(viewer).toContainText('1 / 2');

        // It goes through: the viewer closes and focus lands on the tile that is left (M50).
        await page.unroute(/\/api\/stories\/\d+\/snapshots\/\d+$/);
        await viewer.getByRole('button', { name: 'Delete this Snapshot' }).tap();
        await viewer.getByRole('group', { name: /Delete this Snapshot/ }).getByRole('button', { name: 'Delete' }).tap();
        await expect(viewer).toHaveCount(0);
        await expect(tiles).toHaveCount(1);
        await expect(tiles.first()).toBeFocused();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a page that fails to load says why and loads again with Try again', async ({ page }) => {
    let fail = true;
    await page.route('**/api/stories', (route) =>
        fail && route.request().method() === 'GET' ? route.fulfill({ status: 500, json: BOOM }) : route.continue(),
    );
    for (const [path, title] of [
        ['/gallery', "Couldn't load the Gallery."],
        ['/', "Couldn't load your Stories."],
    ] as const) {
        fail = true;
        await page.goto(path);
        const alert = page.getByRole('alert').filter({ hasText: title });
        await expect(alert).toContainText('The server tripped.');
        fail = false;
        await alert.getByRole('button', { name: 'Try again' }).tap();
        await expect(alert).toHaveCount(0);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
});

test('New Story moves focus to the Idea and back, Cancel works while drafting, and a search finds a Story', async ({ page, request }) => {
    const stamp = `Q${Date.now()}`;
    const ids: number[] = [];
    for (const title of [`${stamp} Harbour`, `${stamp} Orchard`, `${stamp} Ferry`, `${stamp} Quarry`]) {
        ids.push((await (await request.post('/api/stories', { data: { title } })).json()).id as number);
    }
    try {
        await page.goto('/');
        // M35: the Idea takes focus, and Cancel gives it back to New Story.
        await page.getByRole('button', { name: 'New Story' }).tap();
        await expect(page.getByLabel('Idea')).toBeFocused();
        await page.getByLabel('Idea').fill('A ferry that never docks.');

        // M37: Cancel stays usable while the draft is being written.
        await page.route('**/api/stories/draft', () => {
            // Never answers: the draft is "still being written".
        });
        await page.getByRole('button', { name: 'Draft from idea' }).tap();
        await expect(page.getByRole('button', { name: 'Drafting…' })).toBeDisabled();
        const cancel = page.getByRole('region', { name: 'New Story' }).getByRole('button', { name: 'Cancel' });
        await expect(cancel).toBeEnabled();
        await cancel.tap();
        await expect(page.getByRole('region', { name: 'New Story' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'New Story' })).toBeFocused();

        // L17: a search over the titles, and the Draft / Playable filter.
        const search = page.getByRole('searchbox', { name: 'Search Stories' });
        await search.fill(`${stamp} ferry`);
        const cards = page.getByRole('list', { name: 'Stories' }).getByRole('listitem');
        await expect(cards).toHaveCount(1);
        await expect(cards.first()).toContainText(`${stamp} Ferry`);
        await search.fill(stamp);
        await expect(cards).toHaveCount(4);
        await page.getByRole('radio', { name: 'Playable' }).check();
        await expect(page.getByText('No Stories match.')).toBeVisible();
        await page.getByRole('button', { name: 'Show all Stories' }).tap();
        await expect(search).toHaveValue('');
        await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();
    } finally {
        for (const id of ids) await request.delete(`/api/stories/${id}`);
    }
});

test('Remove on a Saved reply asks first, Cancel keeps it, and focus moves on once it is gone', async ({ page, request }) => {
    for (const line of ((await (await request.get('/api/saved-replies')).json()) as { savedReplies: Array<{ id: number }> }).savedReplies) {
        await request.delete(`/api/saved-replies/${line.id}`);
    }
    await request.post('/api/saved-replies', { data: { text: 'First line.' } });
    await request.post('/api/saved-replies', { data: { text: 'Second line.' } });
    try {
        await page.goto('/settings');
        const list = page.getByRole('region', { name: 'Saved replies' });
        await expect(list.getByRole('textbox', { name: 'Saved reply 2' })).toHaveValue('Second line.');

        // H3: one tap only asks; Cancel keeps the line and gives focus back.
        await list.getByRole('button', { name: 'Remove saved reply 1' }).tap();
        const question = list.getByRole('group', { name: /Remove saved reply 1/ });
        await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();
        await question.getByRole('button', { name: 'Cancel' }).tap();
        await expect(list.getByRole('button', { name: 'Remove saved reply 1' })).toBeFocused();
        await expect(list.getByRole('textbox')).toHaveCount(2);

        await list.getByRole('button', { name: 'Remove saved reply 1' }).tap();
        await list.getByRole('group', { name: /Remove saved reply 1/ }).getByRole('button', { name: 'Remove' }).tap();
        await expect(list.getByRole('textbox')).toHaveCount(1);
        await expect(list.getByRole('textbox', { name: 'Saved reply 1' })).toHaveValue('Second line.');
        await expect(list.getByRole('textbox', { name: 'Saved reply 1' })).toBeFocused();
    } finally {
        for (const line of ((await (await request.get('/api/saved-replies')).json()) as { savedReplies: Array<{ id: number }> }).savedReplies) {
            await request.delete(`/api/saved-replies/${line.id}`);
        }
    }
});

test('deleting a Persona moves focus to the next one, and the save status stays in view', async ({ page, request }) => {
    const made: number[] = [];
    for (const name of ['Wren', 'Juniper']) {
        made.push((await (await request.post('/api/personas', { data: { name, description: '' } })).json()).id as number);
    }
    try {
        await page.goto('/personas');
        const wren = page.getByRole('listitem', { name: 'Wren' });
        // L21: what to write is a hint under the box, not a placeholder.
        await expect(wren.getByLabel('Description')).toHaveAccessibleDescription(/Who you are while wearing it/);
        await wren.getByRole('button', { name: 'Delete Wren' }).tap();
        await wren.getByRole('group', { name: /Delete "Wren"/ }).getByRole('button', { name: 'Delete' }).tap();
        await expect(wren).toHaveCount(0);
        // Focus moves a frame after the delete settles, so wait for it rather than read it once.
        await expect.poll(() => focusedName(page)).toBe(`persona-${made[1]}-name`);

        // M17: the header with the save status is sticky.
        await expect(page.getByRole('heading', { name: 'Personas', level: 1 }).locator('..')).toHaveCSS('position', 'sticky');
    } finally {
        for (const id of made) await request.delete(`/api/personas/${id}`);
    }
});

import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// The viewer is used on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const OPENING = 'Rain hammers the gallery windows.\n\n@Mira: Boots off, keeper.';
const SCENE = JSON.stringify({ in_frame: ['Mira'], scene: 'Mira by the window in an oilskin coat.' });

/** A playable Story with a Chat on its Opening and two finished Snapshots of the Opening, made through the API. */
async function createChatWithTwoSnapshots(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    await request.delete(FAKE);
    await request.post(`${FAKE}/text`, { data: { kind: 'snapshot_prompt', replies: [SCENE, SCENE] } });
    await request.post(`${FAKE}/image`, { data: { kind: 'snapshot_image', replies: [{}, {}] } });

    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse', imageStyle: 'ink wash, muted' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey-green eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;

    const snapshots = `/api/stories/${storyId}/chats/${chatId}/snapshots`;
    for (const hint of ['wide', 'close-up']) {
        expect((await request.post(snapshots, { data: { hint } })).ok()).toBe(true);
        await expect
            .poll(async () => ((await (await request.get(snapshots)).json()) as { jobs: unknown[] }).jobs.length)
            .toBe(0);
    }
    return { storyId, chatId };
}

/** A one-finger swipe across the middle of the screen, by (dx, dy). */
async function swipe(page: Page, dx: number, dy: number): Promise<void> {
    const cdp = await page.context().newCDPSession(page);
    const start = { x: 195, y: 400 };
    const steps = 8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    for (let step = 1; step <= steps; step++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: start.x + (dx * step) / steps, y: start.y + (dy * step) / steps }],
        });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
}

/** The `src` of each image in a list, in order. */
async function sources(images: Locator): Promise<string[]> {
    return images.evaluateAll((all) => all.map((img) => img.getAttribute('src') ?? ''));
}

test('in a Chat, a Snapshot opens full screen, a swipe left shows the next one, and a swipe down closes it', async ({
    page,
    request,
}) => {
    const { storyId, chatId } = await createChatWithTwoSnapshots(request);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const thumbs = page.getByRole('region', { name: 'Messages' }).getByRole('img', { name: 'Snapshot with Mira' });
        await expect(thumbs).toHaveCount(2);
        const [first, second] = await sources(thumbs);

        await thumbs.first().click();
        const viewer = page.getByRole('dialog', { name: 'Snapshot' });
        const shown = viewer.getByRole('img', { name: 'Snapshot with Mira' });
        await expect(shown).toHaveAttribute('src', first);
        await expect(viewer).toContainText('1 / 2');
        // Whole, on black.
        await expect(shown).toHaveCSS('object-fit', 'contain');
        await expect(viewer).toHaveCSS('background-color', 'rgb(0, 0, 0)');

        await swipe(page, -200, 0);
        await expect(shown).toHaveAttribute('src', second);
        await expect(viewer).toContainText('2 / 2');

        await swipe(page, 0, 250);
        await expect(viewer).toHaveCount(0);
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats/${chatId}$`));
        await expect(page.getByRole('region', { name: 'Messages' })).toBeInViewport();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('in the Gallery, the same viewer swipes through the filter, steps with the arrow keys, and deletes after confirming', async ({
    page,
    request,
}) => {
    const { storyId } = await createChatWithTwoSnapshots(request);
    try {
        await page.goto(`/stories/${storyId}/gallery`);
        const thumbs = page.getByRole('list', { name: 'Gallery' }).getByRole('img', { name: 'Snapshot with Mira' });
        await expect(thumbs).toHaveCount(2);
        // Thumbnails show the whole image.
        await expect(thumbs.first()).toHaveCSS('object-fit', 'contain');
        const [newest, older] = await sources(thumbs);

        await thumbs.first().click();
        const viewer = page.getByRole('dialog', { name: 'Snapshot' });
        const shown = viewer.getByRole('img', { name: 'Snapshot with Mira' });
        await expect(shown).toHaveAttribute('src', newest);

        await swipe(page, -200, 0);
        await expect(shown).toHaveAttribute('src', older);
        await expect(viewer).toContainText('2 / 2');
        await page.keyboard.press('ArrowLeft');
        await expect(shown).toHaveAttribute('src', newest);
        await page.keyboard.press('ArrowRight');
        await expect(shown).toHaveAttribute('src', older);

        // The Gallery keeps the prompt and download.
        await viewer.getByRole('button', { name: 'Prompt' }).click();
        await expect(viewer.getByLabel('Prompt used')).toContainText('Mira by the window in an oilskin coat.');
        await expect(viewer.getByRole('link', { name: 'Download' })).toHaveAttribute('href', /\/download$/);

        // Delete asks first, then the Snapshot is gone from the Gallery.
        await viewer.getByRole('button', { name: 'Delete' }).click();
        await viewer.getByRole('group', { name: /Delete this Snapshot/ }).getByRole('button', { name: 'Delete' }).click();
        await expect(viewer).toHaveCount(0);
        await expect(thumbs).toHaveCount(1);
        expect(await sources(thumbs)).toEqual([newest]);

        // Swipe down closes it here too.
        await thumbs.first().click();
        await expect(viewer).toContainText('1 / 1');
        await swipe(page, 0, 250);
        await expect(viewer).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

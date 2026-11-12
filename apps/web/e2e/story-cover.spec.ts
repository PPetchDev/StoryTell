import { APIRequestContext, expect, Page, test } from '@playwright/test';
import { takeSnapshot as drawSnapshot } from './harness/snapshot';

// The Cover is set from the Story editor on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const OPENING = 'Rain hammers the gallery windows.\n\n@Mira: Boots off, keeper.';

interface Snapshot {
    id: number;
    imagePath: string;
}

/** A playable Story with Mira, made through the API so the browser test covers only the Cover. */
async function createStory(request: APIRequestContext): Promise<number> {
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
    return storyId;
}

/** Takes one Snapshot of a Chat's Opening through the API, with the fake's 1x1 PNG, and waits for it. */
async function takeSnapshot(request: APIRequestContext, storyId: number, chatId: number): Promise<Snapshot> {
    await request.post(`${FAKE}/text`, {
        data: { kind: 'snapshot_prompt', replies: [JSON.stringify({ in_frame: ['Mira'], scene: 'Mira by the window.' })] },
    });
    await request.post(`${FAKE}/image`, { data: { kind: 'snapshot_image', replies: [{}] } });
    const before = (await (await request.get(`/api/stories/${storyId}/gallery`)).json()).snapshots.length as number;
    expect((await drawSnapshot(request, storyId, chatId)).status()).toBe(202);
    let snapshots: Snapshot[] = [];
    await expect
        .poll(async () => {
            snapshots = (await (await request.get(`/api/stories/${storyId}/gallery`)).json()).snapshots;
            return snapshots.length;
        })
        .toBe(before + 1);
    return snapshots[0];
}

/** A 600x800 PNG drawn by the browser: a phone photo stand-in large enough to tap a point on. */
async function photo(page: Page): Promise<Buffer> {
    const dataUrl = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 800;
        const context = canvas.getContext('2d')!;
        const gradient = context.createLinearGradient(0, 0, 600, 800);
        gradient.addColorStop(0, '#1d3a4f');
        gradient.addColorStop(1, '#ffc46b');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 600, 800);
        return canvas.toDataURL('image/png');
    });
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

async function cover(request: APIRequestContext, storyId: number) {
    return (await (await request.get(`/api/stories/${storyId}`)).json()).cover;
}

test("picks an older Snapshot from the Gallery as the Cover, and Home's card shows it instead of the newest", async ({
    page,
    request,
}) => {
    await request.delete(FAKE);
    const storyId = await createStory(request);
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    const older = await takeSnapshot(request, storyId, chatId);
    const newer = await takeSnapshot(request, storyId, chatId);

    try {
        await page.goto(`/stories/${storyId}`);
        await page.getByRole('button', { name: 'Add a Cover' }).tap();
        const sheet = page.getByRole('dialog', { name: 'Cover' });
        await expect(sheet).toContainText('No cover yet');

        // Newest first, as in the Gallery: the older Snapshot is the second.
        const gallery = sheet.getByRole('region', { name: 'From the Gallery' });
        await expect(gallery.getByRole('button')).toHaveCount(2);
        await gallery.getByRole('button', { name: /^Use Snapshot 2/ }).tap();
        await expect(gallery.getByRole('button', { name: /^Use Snapshot 2/ })).toHaveAttribute('aria-pressed', 'true');
        await expect(gallery.getByRole('button', { name: /^Use Snapshot 1/ })).toHaveAttribute('aria-pressed', 'false');
        expect(await cover(request, storyId)).toMatchObject({ source: 'snapshot', snapshotId: older.id, imagePath: older.imagePath });

        // Mira has no Reference image, so there is nothing to pick there.
        await expect(sheet.getByRole('region', { name: 'Reference images' })).toContainText('No Character has a Reference image yet.');
        await sheet.getByRole('button', { name: 'Close' }).tap();
        const banner = page.getByRole('button', { name: 'Change the Cover' });
        await expect(banner).toHaveAttribute('style', new RegExp(older.imagePath));

        await page.goto('/');
        const card = page.getByRole('list', { name: 'Stories' }).getByRole('button', { name: /The Lighthouse/ });
        const picture = card.locator('span').first();
        await expect(picture).toHaveAttribute('style', new RegExp(older.imagePath));
        await expect(picture).not.toHaveAttribute('style', new RegExp(newer.imagePath));
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('uploads a picture from the phone, taps the point to keep in view, sees it on the card, and removes it', async ({
    page,
    request,
}) => {
    const storyId = await createStory(request);

    try {
        await page.goto(`/stories/${storyId}`);
        await page.getByRole('button', { name: 'Add a Cover' }).tap();
        const sheet = page.getByRole('dialog', { name: 'Cover' });
        await sheet.getByLabel('Picture for the cover').setInputFiles({ name: 'IMG_0412.png', mimeType: 'image/png', buffer: await photo(page) });

        // Sent re-encoded as JPEG, which drops the photo's metadata; the Cover owns the file.
        await expect.poll(async () => (await cover(request, storyId))?.source).toBe('upload');
        const uploaded = await cover(request, storyId);
        expect(uploaded.imagePath).toMatch(new RegExp(`^covers/story-${storyId}/cover-[0-9a-f]+\\.jpg$`));
        const image = sheet.getByRole('img', { name: 'The cover' });
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(600);

        // A tap a quarter across and three quarters down sets the focus point.
        const area = sheet.getByRole('group', { name: /^Focus point/ });
        const box = (await image.boundingBox())!;
        await page.touchscreen.tap(box.x + box.width * 0.25, box.y + box.height * 0.75);
        await expect.poll(async () => (await cover(request, storyId))?.focus).not.toBeNull();
        const focus = (await cover(request, storyId)).focus as { x: number; y: number };
        expect(focus.x).toBeCloseTo(0.25, 1);
        expect(focus.y).toBeCloseTo(0.75, 1);
        await expect(area).toHaveAttribute('aria-label', /25% across and 75% down/);

        await sheet.getByRole('button', { name: 'Close' }).tap();
        await page.goto('/');
        const card = page.getByRole('list', { name: 'Stories' }).getByRole('button', { name: /The Lighthouse/ });
        const picture = card.locator('span').first();
        await expect(picture).toHaveAttribute('style', new RegExp(uploaded.imagePath));
        const position = await picture.evaluate((element) => getComputedStyle(element).backgroundPosition);
        const [x, y] = position.split(' ').map((value) => parseFloat(value));
        expect(x).toBeCloseTo(focus.x * 100, 0);
        expect(y).toBeCloseTo(focus.y * 100, 0);

        // Removing it deletes the uploaded file and brings back the Story's own colours.
        await page.goto(`/stories/${storyId}`);
        await page.getByRole('button', { name: 'Change the Cover' }).tap();
        await sheet.getByRole('button', { name: 'Remove cover' }).tap();
        await expect(sheet).toContainText('The uploaded picture is deleted.');
        await sheet.getByRole('button', { name: 'Remove', exact: true }).tap();
        await expect(sheet).toContainText('No cover yet');
        expect(await cover(request, storyId)).toBeNull();
        expect((await request.get(`/api/images/${uploaded.imagePath}`)).status()).toBe(404);
        await sheet.getByRole('button', { name: 'Close' }).tap();
        await expect(page.getByRole('button', { name: 'Add a Cover' })).toHaveAttribute('style', /linear-gradient/);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

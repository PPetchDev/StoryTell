import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// The Backdrop behind a Chat's Messages (.scratch/chat-looks/spec.md, "Backdrop"), on a phone:
// 390px wide, with touch. The last test widens to a PC.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const OPENING = 'Rain hammers the gallery windows.\n\n@Mira: Boots off, keeper.';

/** A playable Story with Mira and a Chat on its Opening, made through the API. */
async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey-green eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    return { storyId, chatId: (await chat.json()).id as number };
}

/** A 600x800 PNG drawn by the browser. */
async function photo(page: Page): Promise<Buffer> {
    await page.goto('/settings');
    const dataUrl = await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 800;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#ffc46b';
        context.fillRect(0, 0, 600, 800);
        return canvas.toDataURL('image/png');
    });
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/** Uploads a Cover with its focus a quarter across and three quarters down; answers its image path. */
async function uploadCover(page: Page, request: APIRequestContext, storyId: number): Promise<string> {
    const uploaded = await request.put(`/api/stories/${storyId}/cover/upload`, {
        multipart: { image: { name: 'cover.png', mimeType: 'image/png', buffer: await photo(page) } },
    });
    expect(uploaded.ok()).toBe(true);
    const focused = await request.put(`/api/stories/${storyId}/cover/focus`, { data: { x: 0.25, y: 0.75 } });
    expect(focused.ok()).toBe(true);
    return (await focused.json()).cover.imagePath as string;
}

/** The Backdrop's layer, and its picture. */
const backdrop = (page: Page): Locator => page.locator('[data-backdrop]');
const picture = (page: Page): Locator => backdrop(page).locator('img');

/** Chooses the Chat backdrop on the editor's Style tab, and waits for the save. */
async function chooseBackdrop(page: Page, storyId: number, label: 'None' | 'Cover' | 'Newest Snapshot'): Promise<void> {
    await page.goto(`/stories/${storyId}`);
    await page.getByRole('tab', { name: 'Style' }).tap();
    const choice = page.getByRole('radiogroup', { name: 'Chat backdrop' });
    await choice.getByRole('radio', { name: label }).tap();
    await expect(choice.getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
}

test('the Chat backdrop on the Style tab: None by default; Cover shows the Cover dimmed and blurred behind the thread at its focus; None shows nothing', async ({
    page,
    request,
}) => {
    const { storyId, chatId } = await createChat(request);
    try {
        const coverPath = await uploadCover(page, request, storyId);

        // A new Story has no Backdrop, and its Chat looks as before.
        await page.goto(`/stories/${storyId}`);
        await page.getByRole('tab', { name: 'Style' }).tap();
        const choice = page.getByRole('radiogroup', { name: 'Chat backdrop' });
        await expect(choice.getByRole('radio', { name: 'None' })).toHaveAttribute('aria-checked', 'true');
        await expect(page.getByText('Dimmed behind the Messages. Without a Snapshot yet, the Cover shows.')).toBeVisible();
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(page.getByRole('article', { name: 'Opening' })).toContainText('Boots off, keeper.');
        await expect(backdrop(page)).toHaveCount(0);

        await chooseBackdrop(page, storyId, 'Cover');
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(page.getByRole('article', { name: 'Opening' })).toContainText('Boots off, keeper.');
        await expect(picture(page)).toHaveAttribute('src', `/api/images/${coverPath}`);
        await expect.poll(() => picture(page).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
        await expect(picture(page)).toHaveCSS('object-fit', 'cover');
        await expect(picture(page)).toHaveCSS('object-position', '25% 75%');
        await expect(picture(page)).toHaveCSS('filter', 'blur(3px)');
        // Decoration: hidden from screen readers, and behind the whole screen.
        await expect(backdrop(page)).toHaveAttribute('aria-hidden', 'true');
        const box = await backdrop(page).boundingBox();
        expect(box).toEqual({ x: 0, y: 0, width: 390, height: 844 });
        // The dimming overlay of the page colour sits over the picture.
        const dim = await backdrop(page).evaluate((element) => getComputedStyle(element, '::after').backgroundColor);
        expect(dim).toBe('rgba(22, 19, 31, 0.94)');
        // The Messages are still on top: a tap reaches the thread, not the picture.
        await expect(page.getByRole('article', { name: 'Opening' }).getByText('Boots off, keeper.')).toBeVisible();
        const topmost = await page.evaluate(() => {
            const line = [...document.querySelectorAll('article p')].find((p) => p.textContent?.includes('Boots off'))!;
            const rect = line.getBoundingClientRect();
            return document.elementFromPoint(rect.x + 4, rect.y + rect.height / 2)?.closest('article') !== null;
        });
        expect(topmost).toBe(true);

        // The light theme dims with its own page colour.
        await page.evaluate(() => localStorage.setItem('storytell.theme', 'light'));
        await page.reload();
        await expect(picture(page)).toHaveAttribute('src', `/api/images/${coverPath}`);
        expect(await backdrop(page).evaluate((element) => getComputedStyle(element, '::after').backgroundColor)).toBe('rgba(246, 244, 250, 0.9)');

        await chooseBackdrop(page, storyId, 'None');
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(page.getByRole('article', { name: 'Opening' })).toContainText('Boots off, keeper.');
        await expect(backdrop(page)).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('Newest Snapshot shows the Cover until a Snapshot is taken, then that Snapshot; one a Reset took away gives way to the Cover', async ({
    page,
    request,
}) => {
    await request.delete(FAKE);
    const { storyId, chatId } = await createChat(request);
    await request.post(`${FAKE}/text`, {
        data: { kind: 'snapshot_prompt', replies: [JSON.stringify({ in_frame: ['Mira'], scene: 'Mira by the window.' })] },
    });
    await request.post(`${FAKE}/image`, { data: { kind: 'snapshot_image', replies: [{}] } });
    try {
        // With neither a Cover nor a Snapshot, no picture at all.
        await request.patch(`/api/stories/${storyId}`, { data: { backdrop: 'snapshot' } });
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(page.getByRole('article', { name: 'Opening' })).toContainText('Boots off, keeper.');
        await expect(backdrop(page)).toHaveCount(0);

        const coverPath = await uploadCover(page, request, storyId);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(picture(page)).toHaveAttribute('src', `/api/images/${coverPath}`);

        // A new Snapshot takes its place as soon as it is made, without a reload.
        const opening = page.getByRole('article', { name: 'Opening' });
        await opening.getByRole('group', { name: 'Message actions' }).getByRole('button', { name: 'Snapshot' }).tap();
        await page.getByRole('dialog', { name: 'Take a Snapshot' }).getByRole('button', { name: 'Take Snapshot' }).tap();
        const thumb = page.getByRole('region', { name: 'Messages' }).getByRole('img', { name: 'Snapshot with Mira' });
        await expect(thumb).toBeVisible({ timeout: 10_000 });
        const snapshotSrc = await thumb.getAttribute('src');
        await expect(picture(page)).toHaveAttribute('src', snapshotSrc!);
        // A Snapshot is shown whole: centred, with no focus point.
        await expect(picture(page)).toHaveCSS('object-position', '50% 50%');

        // Reset takes its Message away, so it is no longer where the story is: the Cover again.
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Reset/ }).click();
        await page.getByRole('alertdialog', { name: /start this Chat over/ }).getByRole('button', { name: 'Reset' }).click();
        await expect(thumb).toHaveCount(0);
        await expect(picture(page)).toHaveAttribute('src', `/api/images/${coverPath}`);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test.describe('on a PC', () => {
    test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });

    test('the Backdrop spans the Chat area beside the side rail, and the docked Memory drawer stays opaque over it', async ({ page, request }) => {
        const { storyId, chatId } = await createChat(request);
        try {
            await uploadCover(page, request, storyId);
            await request.patch(`/api/stories/${storyId}`, { data: { backdrop: 'cover' } });
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            await expect(picture(page)).toBeVisible();

            const rail = await page.getByRole('navigation').first().boundingBox();
            const box = await backdrop(page).boundingBox();
            expect(box).toEqual({ x: rail!.width, y: 0, width: 1440 - rail!.width, height: 900 });

            await page.getByRole('button', { name: 'Chat menu' }).click();
            await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
            const drawer = page.getByRole('complementary', { name: 'Memory' });
            await expect(drawer).toBeVisible();
            // An opaque colour: no alpha, so nothing of the picture shows through it.
            const fill = await drawer.evaluate((element) => getComputedStyle(element).backgroundColor);
            expect(fill).not.toMatch(/rgba|\/|transparent/);
            // The drawer is over the picture, not under it.
            const drawerBox = (await drawer.boundingBox())!;
            const onTop = await page.evaluate(
                ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-backdrop]') === null,
                [drawerBox.x + drawerBox.width / 2, drawerBox.y + drawerBox.height - 10],
            );
            expect(onTop).toBe(true);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

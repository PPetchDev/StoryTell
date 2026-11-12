import { APIRequestContext, expect, test } from '@playwright/test';

// Snapshots are taken during play, on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const OPENING = 'Rain hammers the gallery windows.\n\n@Mira: Boots off, keeper.';

/** A playable Story with one Character and a Chat on its Opening, made through the API. */
async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
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
    return { storyId, chatId: (await chat.json()).id as number };
}

/** The fake gateway's calls of one method and kind. */
async function callsOf(request: APIRequestContext, method: string, kind: string): Promise<Array<{ request: { prompt?: string } }>> {
    const { calls } = (await (await request.get(`${FAKE}/calls`)).json()) as { calls: Array<{ method: string; request: { kind: string; prompt?: string } }> };
    return calls.filter((call) => call.method === method && call.request.kind === kind);
}

test('takes a Snapshot from the action row with a hint, reads and edits its prompt, draws it, sees the placeholder and then the image, resets, and finds it in the Gallery as from an earlier version', async ({
    page,
    request,
}) => {
    await request.delete(FAKE);
    const { storyId, chatId } = await createChat(request);
    await request.post(`${FAKE}/text`, {
        data: { kind: 'snapshot_prompt', replies: [JSON.stringify({ in_frame: ['Mira'], scene: 'Mira by the window in an oilskin coat.' })] },
    });
    // Held back long enough to see the placeholder; the fake's 1x1 PNG is enough to see it load.
    await request.post(`${FAKE}/image`, { data: { kind: 'snapshot_image', replies: [{ delayMs: 1_500 }] } });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const opening = page.getByRole('article', { name: 'Opening' });
        await expect(opening).toContainText('Boots off, keeper.');

        // The composer has no camera any more; 📷 is in the newest reply's action row.
        await expect(page.getByRole('form', { name: 'Composer' }).getByRole('textbox', { name: 'Snapshot hint' })).toHaveCount(0);
        await opening.getByRole('group', { name: 'Message actions' }).getByRole('button', { name: 'Snapshot' }).tap();
        const sheet = page.getByRole('dialog', { name: 'Take a Snapshot' });
        await sheet.getByRole('textbox', { name: 'Snapshot hint' }).fill('close-up on Mira');
        await sheet.getByRole('button', { name: 'Write the prompt' }).tap();

        // The Snapshot prompt is read before anything is drawn (.scratch/snapshot-prompt-review/spec.md).
        const text = sheet.getByRole('textbox', { name: 'Snapshot prompt' });
        await expect(text).toHaveValue('Mira by the window in an oilskin coat.');
        await expect(sheet).toContainText('In frame: Mira');
        expect(await callsOf(request, 'generateImage', 'snapshot_image')).toHaveLength(0);
        // The fixed rules around it can be read, not edited, and follow the edit.
        await text.fill('Mira faces me by the window, oilskin coat dripping.');
        await sheet.getByText('Everything the image model gets').tap();
        const whole = sheet.getByLabel('Whole image prompt');
        await expect(whole).toContainText('First-person view through the eyes of Ash');
        await expect(whole).toContainText('Mira faces me by the window, oilskin coat dripping.');
        await expect(whole).toContainText('Appearance: Tall, grey-green eyes.');
        await sheet.getByRole('button', { name: 'Draw Snapshot' }).tap();
        await expect(sheet).toHaveCount(0);

        // The placeholder shows under the Message while play could go on, then the image replaces it.
        const placeholder = page.getByRole('status', { name: 'Snapshot being made' });
        await expect(placeholder).toBeVisible();
        const thumb = page.getByRole('region', { name: 'Messages' }).getByRole('img', { name: 'Snapshot with Mira' });
        await expect(thumb).toBeVisible({ timeout: 10_000 });
        await expect(placeholder).toHaveCount(0);
        // The hint steered the picture: it reached the call that writes the image prompt.
        const calls = await (await request.get(`${FAKE}/calls`)).json();
        expect(JSON.stringify(calls)).toContain("The user's hint for this image, which you follow: close-up on Mira");
        // The edit was drawn, and the writer was called once.
        const [drawn] = await callsOf(request, 'generateImage', 'snapshot_image');
        expect(drawn.request.prompt).toContain('Mira faces me by the window, oilskin coat dripping.');
        expect(await callsOf(request, 'completeText', 'snapshot_prompt')).toHaveLength(1);
        await expect(thumb).toHaveAttribute('src', /^\/api\/images\/snapshots\/story-\d+\/chat-\d+-[0-9a-f]+\.png$/);
        await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
        // Shown whole in the thread, never cropped.
        await expect(thumb).toHaveCSS('object-fit', 'contain');

        // Full screen, with the prompt it was drawn from.
        await thumb.click();
        // Exact: the sheet, "Take a Snapshot", is a dialog too.
        const viewer = page.getByRole('dialog', { name: 'Snapshot', exact: true });
        await viewer.getByRole('button', { name: 'Show prompt' }).click();
        await expect(viewer.getByLabel('Prompt used')).toContainText('First-person view through the eyes of Ash');
        await expect(viewer.getByLabel('Prompt used')).toContainText('Mira faces me by the window, oilskin coat dripping.');
        await expect(viewer.getByLabel('Prompt used')).toContainText('Appearance: Tall, grey-green eyes.');
        // A retake opens the sheet with its hint, to be read before drawing too.
        await viewer.getByRole('button', { name: 'Retake' }).click();
        await expect(viewer).toHaveCount(0);
        await expect(sheet.getByRole('textbox', { name: 'Snapshot hint' })).toHaveValue('close-up on Mira');
        await expect(sheet.getByRole('button', { name: 'Write the prompt' })).toBeVisible();
        await sheet.getByRole('button', { name: 'Close' }).click();
        await expect(sheet).toHaveCount(0);
        expect(await callsOf(request, 'completeText', 'snapshot_prompt')).toHaveLength(1);
        await thumb.click();
        await viewer.getByRole('button', { name: 'Close' }).click();

        // Reset takes the Message away; the Snapshot leaves the timeline.
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Reset/ }).click();
        await page.getByRole('alertdialog', { name: /start this Chat over/ }).getByRole('button', { name: 'Reset' }).click();
        await expect(thumb).toHaveCount(0);

        // The Gallery keeps it, marked as from an earlier version of this Chat.
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('link', { name: /^Gallery/ }).click();
        await expect(page.getByRole('heading', { name: /Gallery/ })).toBeVisible();
        // Grouped by Chat: the list is named for its Chat.
        const gallery = page.getByRole('list', { name: 'Snapshots of Chat 1' });
        await expect(gallery.getByRole('listitem')).toHaveCount(1);
        await expect(gallery).toContainText('From an earlier version of this Chat');
        await expect(page.getByRole('heading', { name: /^Chat 1/ })).toBeVisible();
        await gallery.getByRole('img', { name: 'Snapshot with Mira' }).click();
        await expect(page.getByRole('dialog', { name: 'Snapshot' })).toContainText('From an earlier version of this Chat.');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('Write again and Cancel cost no picture, and a prompt that fails to write says so in the sheet with Try again', async ({ page, request }) => {
    await request.delete(FAKE);
    const { storyId, chatId } = await createChat(request);
    const written = (scene: string) => JSON.stringify({ in_frame: ['Mira'], scene });
    await request.post(`${FAKE}/text`, {
        data: {
            kind: 'snapshot_prompt',
            replies: [written('Mira turns her back.'), written('Mira faces the lamp.'), { error: 'outage', message: 'DeepInfra answered 503.' }, written('Mira at the stove.')],
        },
    });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const opening = page.getByRole('article', { name: 'Opening' });
        const camera = opening.getByRole('group', { name: 'Message actions' }).getByRole('button', { name: 'Snapshot' });
        await camera.tap();
        const sheet = page.getByRole('dialog', { name: 'Take a Snapshot' });
        await sheet.getByRole('button', { name: 'Write the prompt' }).tap();
        const text = sheet.getByRole('textbox', { name: 'Snapshot prompt' });
        await expect(text).toHaveValue('Mira turns her back.');

        // Write again, with a new hint: only the writer is called again.
        await sheet.getByRole('textbox', { name: 'Snapshot hint' }).fill('Mira facing me');
        await sheet.getByRole('button', { name: 'Write again' }).tap();
        await expect(text).toHaveValue('Mira faces the lamp.');
        const asked = await callsOf(request, 'completeText', 'snapshot_prompt');
        expect(asked).toHaveLength(2);
        expect(JSON.stringify(asked[1])).toContain("The user's hint for this image, which you follow: Mira facing me");

        // Cancel throws it away: no picture, no placeholder, and nothing to draw left over.
        await sheet.getByRole('button', { name: 'Cancel' }).tap();
        await expect(sheet).toHaveCount(0);
        await expect(page.getByRole('status', { name: 'Snapshot being made' })).toHaveCount(0);
        expect(await callsOf(request, 'generateImage', 'snapshot_image')).toHaveLength(0);

        // A failed write shows in the sheet in plain words, and Try again writes it.
        await camera.tap();
        await expect(sheet.getByRole('textbox', { name: 'Snapshot hint' })).toHaveValue('');
        await sheet.getByRole('button', { name: 'Write the prompt' }).tap();
        await expect(sheet.getByRole('alert')).toContainText("Couldn't write the Snapshot prompt.");
        await expect(sheet.getByText('DeepInfra')).toHaveCount(0);
        await sheet.getByRole('button', { name: 'Try again' }).tap();
        await expect(text).toHaveValue('Mira at the stove.');
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);
        expect(await callsOf(request, 'generateImage', 'snapshot_image')).toHaveLength(0);
        const gallery = (await (await request.get(`/api/stories/${storyId}/gallery`)).json()) as { snapshots: unknown[] };
        expect(gallery.snapshots).toEqual([]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

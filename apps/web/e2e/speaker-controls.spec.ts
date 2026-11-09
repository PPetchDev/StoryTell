import { APIRequestContext, expect, Page, test } from '@playwright/test';

// The Chat is played on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.\n\n@Kai: Evening!';

/** A playable Story with these Characters and one Chat of it, through the API. */
async function createChat(request: APIRequestContext, names: string[]) {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
    });
    await request.patch(`/api/stories/${storyId}/role`, {
        data: { name: 'Ash', description: 'The new keeper, arrived this morning.' },
    });
    let characters: Array<{ id: number; name: string }> = [];
    for (const name of names) {
        const added = await request.post(`/api/stories/${storyId}/characters`, {
            data: { name, appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' },
        });
        characters = (await added.json()).characters;
    }
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number, characters };
}

/** Opens ⋯ and answers the menu's "Who's in this Chat" row. */
async function whoRow(page: Page) {
    await page.getByRole('button', { name: 'Chat menu' }).tap();
    return page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Who's in this Chat/ });
}

test("setting a Character sitting out from the Chat menu shows on the row, survives a reload, and switching them back says everyone is in", async ({
    page,
    request,
}) => {
    const { storyId, chatId, characters } = await createChat(request, ['Mira', 'Kai']);
    const [mira] = characters;
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const row = await whoRow(page);
        await expect(row).toContainText('Everyone is in');
        // After Author's note, as the integration notes order the new rows.
        const rows = page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button');
        const labels = await rows.allInnerTexts();
        const at = (label: RegExp) => labels.findIndex((text) => label.test(text));
        expect(at(/^Who's in this Chat/)).toBe(at(/^Author's note/) + 1);
        await row.tap();

        const sheet = page.getByRole('dialog', { name: "Who's in this Chat" });
        const miraSwitch = sheet.getByRole('switch', { name: 'Mira' });
        const kaiSwitch = sheet.getByRole('switch', { name: 'Kai' });
        await expect(miraSwitch).toHaveAttribute('aria-checked', 'true');
        await expect(miraSwitch).toHaveText('In the story');
        await expect(kaiSwitch).toHaveAttribute('aria-checked', 'true');

        await miraSwitch.tap();
        await expect(miraSwitch).toHaveAttribute('aria-checked', 'false');
        await expect(miraSwitch).toHaveText('Sitting out');
        await expect(kaiSwitch).toHaveAttribute('aria-checked', 'true');
        const saved = await request.get(`/api/stories/${storyId}/chats/${chatId}`);
        expect((await saved.json()).sittingOut).toEqual([mira.id]);
        await sheet.getByRole('button', { name: 'Close' }).tap();
        await expect(sheet).toHaveCount(0);

        await expect(await whoRow(page)).toContainText('Mira is sitting out');
        await page.keyboard.press('Escape');
        // The thread is unchanged: her line in the Opening shows as it always did.
        await expect(page.getByText('Boots off, keeper.')).toBeVisible();

        await page.reload();
        const after = await whoRow(page);
        await expect(after).toContainText('Mira is sitting out');
        await after.tap();
        await expect(miraSwitch).toHaveAttribute('aria-checked', 'false');
        await kaiSwitch.tap();
        await expect(kaiSwitch).toHaveAttribute('aria-checked', 'false');
        await miraSwitch.tap();
        await expect(miraSwitch).toHaveAttribute('aria-checked', 'true');
        await expect(kaiSwitch).toHaveAttribute('aria-checked', 'false');
        await kaiSwitch.tap();
        await expect(kaiSwitch).toHaveAttribute('aria-checked', 'true');
        await sheet.getByRole('button', { name: 'Close' }).tap();

        await expect(await whoRow(page)).toContainText('Everyone is in');
        const back = await request.get(`/api/stories/${storyId}/chats/${chatId}`);
        expect((await back.json()).sittingOut).toEqual([]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test("with a Character sitting out, the Memory drawer's add form starts with them unticked, and ticking them keeps them", async ({ page, request }) => {
    const { storyId, chatId, characters } = await createChat(request, ['Mira', 'Kai']);
    const [mira, kai] = characters;
    try {
        await request.put(`/api/stories/${storyId}/chats/${chatId}/sitting-out`, { data: { characterIds: [mira.id] } });
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).tap();
        const drawer = page.getByRole('complementary', { name: 'Memory' });
        await drawer.getByRole('button', { name: 'Add a Memory' }).click();

        // Both speak in the Opening, so both would be present; Mira sits out.
        const form = drawer.getByRole('group', { name: 'New Memory' });
        await expect(form.getByRole('checkbox', { name: 'Mira' })).not.toBeChecked();
        await expect(form.getByRole('checkbox', { name: 'Kai' })).toBeChecked();

        await form.getByRole('textbox', { name: 'Memory text' }).fill('Mira keeps a diary.');
        await form.getByRole('checkbox', { name: 'Mira' }).check();
        await expect(drawer.getByRole('status').filter({ hasText: /Sav|save/ })).toHaveText('Saved');
        await drawer.getByRole('button', { name: 'Done' }).click();
        const listed = await request.get(`/api/stories/${storyId}/chats/${chatId}/memories`);
        const saved = (await listed.json()).memories.find((memory: { text: string }) => memory.text === 'Mira keeps a diary.');
        expect(saved.knownBy).toEqual([mira.id, kai.id]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test("a one-Character Story's Chat menu offers \"Who's in this Chat\" too", async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request, ['Mira']);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const row = await whoRow(page);
        await expect(row).toContainText('Everyone is in');
        await row.tap();
        const sheet = page.getByRole('dialog', { name: "Who's in this Chat" });
        await expect(sheet.getByRole('switch')).toHaveCount(1);
        await sheet.getByRole('switch', { name: 'Mira' }).tap();
        await expect(sheet.getByRole('switch', { name: 'Mira' })).toHaveAttribute('aria-checked', 'false');
        await sheet.getByRole('button', { name: 'Close' }).tap();
        await expect(await whoRow(page)).toContainText('Mira is sitting out');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

/** One turn reply with background calls that change nothing; `turn` may be a scripted failure. */
async function scriptTurn(request: APIRequestContext, turn: string | object) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [typeof turn === 'string' ? { text: turn, model: 'glm-5.3' } : turn] } });
    if (typeof turn !== 'string') return;
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

/** The nudge each turn request carried, in order. */
function watchNudges(page: Page): Array<number | null> {
    const sent: Array<number | null> = [];
    page.on('request', (request) => {
        if (request.method() === 'GET' || !/\/(messages|continue|retry|regenerate)$/.test(new URL(request.url()).pathname)) return;
        const body = request.postData();
        sent.push(body ? ((JSON.parse(body).nudgeCharacterId as number | undefined) ?? null) : null);
    });
    return sent;
}

test('a tapped Character chip nudges them: ▶ Continue sends it and the highlight clears once the reply is in; a second tap takes it back', async ({
    page,
    request,
}) => {
    const { storyId, chatId, characters } = await createChat(request, ['Mira', 'Kai']);
    const [, kai] = characters;
    await request.delete('/api/testing/fake-gateway');
    await scriptTurn(request, '@Kai: You rang?');
    const nudges = watchNudges(page);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const row = composer.getByRole('group', { name: 'Nudge a Character' });
        const miraChip = row.getByRole('button', { name: 'Mira' });
        const kaiChip = row.getByRole('button', { name: 'Kai' });
        await expect(row.getByRole('button')).toHaveText([/Mira$/, /Kai$/, "Who's here"]);

        // The row is band 2: below the panel, above the tools.
        const tools = (await composer.getByRole('toolbar', { name: 'Composer tools' }).boundingBox())!;
        const band = (await row.boundingBox())!;
        expect(band.y + band.height).toBeLessThanOrEqual(tools.y + 1);

        // One at a time; a second tap takes it back.
        await miraChip.tap();
        await expect(miraChip).toHaveAttribute('aria-pressed', 'true');
        await kaiChip.tap();
        await expect(kaiChip).toHaveAttribute('aria-pressed', 'true');
        await expect(miraChip).toHaveAttribute('aria-pressed', 'false');
        await kaiChip.tap();
        await expect(kaiChip).toHaveAttribute('aria-pressed', 'false');
        await kaiChip.tap();

        await composer.getByRole('button', { name: 'Continue' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('You rang?');
        await expect(kaiChip).toHaveAttribute('aria-pressed', 'false');
        expect(nudges).toEqual([kai.id]);

        const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.client);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a failed turn keeps the nudge and Retry sends it; setting the nudged Character sitting out from "Who\'s here" drops chip and nudge', async ({
    page,
    request,
}) => {
    const { storyId, chatId, characters } = await createChat(request, ['Mira', 'Kai']);
    const [mira] = characters;
    await request.delete('/api/testing/fake-gateway');
    await scriptTurn(request, { error: 'outage', message: 'DeepInfra answered 503.' });
    const nudges = watchNudges(page);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const row = composer.getByRole('group', { name: 'Nudge a Character' });
        const miraChip = row.getByRole('button', { name: 'Mira' });

        await miraChip.tap();
        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('Mira? Are you there?');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByText('The last turn failed. Your message is kept.')).toBeVisible();
        await expect(miraChip).toHaveAttribute('aria-pressed', 'true');

        await scriptTurn(request, '@Mira: Here.');
        await page.getByRole('button', { name: 'Retry', exact: true }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Here.');
        await expect(miraChip).toHaveAttribute('aria-pressed', 'false');
        expect(nudges).toEqual([mira.id, mira.id]);

        // Nudged again, then set sitting out: her chip and the nudge go; the last chip counts her.
        await miraChip.tap();
        await row.getByRole('button', { name: "Who's here" }).tap();
        const sheet = page.getByRole('dialog', { name: "Who's in this Chat" });
        await sheet.getByRole('switch', { name: 'Mira' }).tap();
        await expect(sheet.getByRole('switch', { name: 'Mira' })).toHaveAttribute('aria-checked', 'false');
        await sheet.getByRole('button', { name: 'Close' }).tap();
        await expect(row.getByRole('button')).toHaveText([/Kai$/, '1 sitting out']);
        await expect(row.getByRole('button', { name: 'Kai' })).toHaveAttribute('aria-pressed', 'false');

        // The next turn carries no nudge.
        await scriptTurn(request, '@Kai: Quiet night.');
        await composer.getByRole('button', { name: 'Continue' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Quiet night.');
        expect(nudges).toEqual([mira.id, mira.id, null]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a one-Character Story shows no Character row', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request, ['Mira']);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(page.getByRole('form', { name: 'Composer' }).getByRole('textbox')).toBeVisible();
        await expect(page.getByRole('group', { name: 'Nudge a Character' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

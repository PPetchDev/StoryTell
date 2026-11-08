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

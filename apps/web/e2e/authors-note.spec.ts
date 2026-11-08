import { APIRequestContext, expect, Page, test } from '@playwright/test';

// The Chat is played on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NONE = 'None: steer this Chat in your own words';

/** A playable Story and one Chat of it, through the API. */
async function createChat(request: APIRequestContext) {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
    });
    await request.patch(`/api/stories/${storyId}/role`, {
        data: { name: 'Ash', description: 'The new keeper, arrived this morning.' },
    });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' },
    });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

/** Opens ⋯ and answers the menu's Author's note row. */
async function noteRow(page: Page) {
    await page.getByRole('button', { name: 'Chat menu' }).tap();
    return page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Author's note/ });
}

test("an Author's note written from the Chat menu shows its first line there, survives a reload, and Clear makes it None", async ({
    page,
    request,
}) => {
    const { storyId, chatId } = await createChat(request);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const row = await noteRow(page);
        await expect(row).toContainText(NONE);
        await row.tap();

        const sheet = page.getByRole('dialog', { name: "Author's note" });
        const box = sheet.getByRole('textbox', { name: "Author's note" });
        await expect(box).toBeFocused();
        await expect(box).toHaveAttribute('placeholder', /Keep it a slow burn\./);
        await expect(sheet.getByText('0 / 1,000')).toBeVisible();
        await box.fill('Keep it a slow burn.\nIt rains all day.');
        await expect(sheet.getByText('38 / 1,000')).toBeVisible();
        await sheet.getByRole('button', { name: 'Save' }).tap();
        await expect(sheet).toHaveCount(0);

        const written = await noteRow(page);
        await expect(written).toContainText('Keep it a slow burn.');
        await expect(written).not.toContainText('It rains all day.');
        await page.reload();
        const after = await noteRow(page);
        await expect(after).toContainText('Keep it a slow burn.');
        const saved = await request.get(`/api/stories/${storyId}/chats/${chatId}`);
        expect((await saved.json()).authorsNote).toBe('Keep it a slow burn.\nIt rains all day.');

        await after.tap();
        await expect(box).toHaveValue('Keep it a slow burn.\nIt rains all day.');
        await sheet.getByRole('button', { name: 'Clear' }).tap();
        await expect(sheet).toHaveCount(0);
        await expect(await noteRow(page)).toContainText(NONE);
        await page.reload();
        await expect(await noteRow(page)).toContainText(NONE);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test("the Author's note stops at 1,000 characters, typed or pasted, and Cancel keeps the saved note", async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await (await noteRow(page)).tap();
        const sheet = page.getByRole('dialog', { name: "Author's note" });
        const box = sheet.getByRole('textbox', { name: "Author's note" });

        // A paste longer than the cap is cut to it.
        await page.keyboard.insertText('p'.repeat(1_200));
        await expect(box).toHaveValue('p'.repeat(1_000));
        await expect(sheet.getByText('1,000 / 1,000')).toBeVisible();
        // Typing stops there.
        await box.press('End');
        await box.pressSequentially('more');
        await expect(box).toHaveValue('p'.repeat(1_000));
        await expect(sheet.getByText('1,000 / 1,000')).toBeVisible();

        await sheet.getByRole('button', { name: 'Save' }).tap();
        await expect(sheet).toHaveCount(0);
        const saved = await request.get(`/api/stories/${storyId}/chats/${chatId}`);
        expect((await saved.json()).authorsNote).toBe('p'.repeat(1_000));

        await (await noteRow(page)).tap();
        await box.fill('Something else.');
        await sheet.getByRole('button', { name: 'Cancel' }).tap();
        await expect(sheet).toHaveCount(0);
        const kept = await request.get(`/api/stories/${storyId}/chats/${chatId}`);
        expect((await kept.json()).authorsNote).toBe('p'.repeat(1_000));
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

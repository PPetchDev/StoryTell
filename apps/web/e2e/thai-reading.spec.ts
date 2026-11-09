import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// ไทย is read on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';
const REPLY_THAI = 'Mira: *เธอยักไหล่* กุญแจอยู่ในกระเป๋าฉัน';
const LINE_THAI = 'กุญแจอยู่ไหน';

async function scriptTurn(request: APIRequestContext, reply: string): Promise<void> {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

async function playedChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.delete('/api/testing/fake-gateway');
    await scriptTurn(request, '@Mira: *She shrugs.* In my pocket.');
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'Where is the key?' } })).ok()).toBe(true);
    return { storyId, chatId };
}

/** ไทย among a Message's actions, opening the "⋯" menu first when it moved there at this width. */
async function thaiButton(message: Locator): Promise<Locator> {
    const inRow = message.getByRole('button', { name: 'Thai reading' });
    if (await inRow.isVisible()) return inRow;
    await message.getByRole('button', { name: 'More actions' }).tap();
    return message.getByRole('group', { name: 'More actions' }).getByRole('button', { name: 'Thai reading' });
}

async function expectNoSidewaysScroll(page: Page): Promise<void> {
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
}

test('ไทย reads the newest reply and a User Message in Thai, toggles with no call, survives a reload and goes with an edit', async ({ page, request }) => {
    const { storyId, chatId } = await playedChat(request);
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'thai_reading', replies: [REPLY_THAI, LINE_THAI] } });
    const asked: string[] = [];
    page.on('request', (sent) => {
        if (sent.url().endsWith('/thai-reading')) asked.push(sent.url());
    });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const reply = page.getByRole('article', { name: 'AI reply' });
        const line = page.getByRole('article', { name: 'Ash said' });
        await expect(reply).toContainText('In my pocket.');
        await expect(page.getByRole('region', { name: 'Thai reading' })).toHaveCount(0);

        // The newest reply: a tap asks, and the reading shows under the story text, actions in italics.
        let thai = await thaiButton(reply);
        await expect(thai).toHaveAttribute('aria-pressed', 'false');
        await thai.tap();
        const replyReading = reply.getByRole('region', { name: 'Thai reading' });
        await expect(replyReading).toContainText('กุญแจอยู่ในกระเป๋าฉัน');
        await expect(replyReading).toHaveAttribute('lang', 'th');
        await expect(replyReading.locator('em')).toHaveText('เธอยักไหล่');
        await expectNoSidewaysScroll(page);

        // A second tap hides it, a third shows it again: no new call either time.
        thai = await thaiButton(reply);
        await expect(thai).toHaveAttribute('aria-pressed', 'true');
        await thai.tap();
        await expect(replyReading).toHaveCount(0);
        await (await thaiButton(reply)).tap();
        await expect(replyReading).toBeVisible();
        expect(asked).toHaveLength(1);

        // A User Message: ไทย is among its tools once tapped.
        await line.tap();
        await (await thaiButton(line)).tap();
        await expect(line.getByRole('region', { name: 'Thai reading' })).toHaveText(/กุญแจอยู่ไหน/);
        expect(asked).toHaveLength(2);
        await expectNoSidewaysScroll(page);

        // Kept: both show after a reload, with no call.
        await page.reload();
        await expect(reply.getByRole('region', { name: 'Thai reading' })).toBeVisible();
        await expect(line.getByRole('region', { name: 'Thai reading' })).toBeVisible();
        expect(asked).toHaveLength(2);

        // An edit of the line: its reading no longer shows.
        await scriptTurn(request, '@Mira: Still in my pocket.');
        await line.tap();
        await line.getByRole('button', { name: 'Edit' }).tap();
        await line.getByRole('textbox').fill('Where did you put the key?');
        await line.getByRole('button', { name: 'Save' }).tap();
        await page.getByRole('button', { name: 'Save and rewind' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Still in my pocket.');
        await expect(page.getByRole('article', { name: 'AI reply' })).toHaveCount(1);
        await expect(page.getByRole('article', { name: 'Ash said' })).toContainText('Where did you put the key?');
        await expect(page.getByRole('region', { name: 'Thai reading' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a failed Thai reading says so under that Message', async ({ page, request }) => {
    const { storyId, chatId } = await playedChat(request);
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'thai_reading', replies: ['   '] } });

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const reply = page.getByRole('article', { name: 'AI reply' });
        await (await thaiButton(reply)).tap();
        await expect(reply.getByRole('alert')).toHaveText("Couldn't make a Thai reading, try again");
        await expect(reply.getByRole('region', { name: 'Thai reading' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

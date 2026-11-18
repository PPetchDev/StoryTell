import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Search and Bookmarks (.scratch/chat-search/spec.md) on the user's phone: 360px wide, with touch.
test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';
/** Enough turns that the thread scrolls many screens: 61 Messages with the Opening. */
const TURNS = 30;

interface Played {
    storyId: number;
    chatId: number;
    /** In thread order, the Opening first. */
    messageIds: number[];
}

/** What turn `index` says: one line about the brass compass (turn 6) and one in Thai (turn 20's reply); the rest filler. */
function userLine(index: number): string {
    return index === 6 ? 'I turn the brass COMPASS over in my hands.' : `I climb step ${index} of the tower stair.`;
}
function replyLine(index: number): string {
    if (index === 20) return 'She lifts the old lamp.\n\n@Mira: ตะเกียงดวงนี้เก่ากว่าประภาคารอีก';
    return `Wind against the glass, turn ${index}.\n\n@Mira: Keep climbing, keeper.`;
}

/** A playable Story with a Chat `TURNS` turns in, all through the API. */
async function createLongChat(request: APIRequestContext): Promise<Played> {
    const created = await request.post('/api/stories', { data: { title: 'The Long Watch' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });

    await request.delete('/api/testing/fake-gateway');
    const turns = Array.from({ length: TURNS }, (_, index) => index + 1);
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: turns.map((index) => ({ text: replyLine(index), model: 'glm-5.3' })) } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: turns.map(() => NO_CHANGE) } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: turns.map(() => NO_OPS) } });
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    let messageIds: number[] = [];
    for (const index of turns) {
        const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: userLine(index) } });
        expect(sent.ok(), `turn ${index}: ${sent.status()} ${await sent.text()}`).toBe(true);
        messageIds = ((await sent.json()).messages as Array<{ id: number }>).map((message) => message.id);
        // Settled before the next send, so a slow machine never meets "still saving".
        await expect
            .poll(async () => {
                const last = (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1);
                return [last.judge.status, last.memory.status];
            })
            .toEqual(['done', 'done']);
    }
    return { storyId, chatId, messageIds };
}

async function cleanUp(request: APIRequestContext, played: Played): Promise<void> {
    await request.delete('/api/testing/fake-gateway');
    // Leaves the shared e2e database as it was found, Chats included.
    await request.delete(`/api/stories/${played.storyId}`);
}

async function openFind(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'Search this Chat' }).tap();
    const sheet = page.getByRole('dialog', { name: 'Find in this Chat' });
    await expect(sheet).toBeVisible();
    return sheet;
}

/** The Message is on screen inside the thread, outlined, and has the focus. */
async function expectLandedOn(page: Page, messageId: number): Promise<void> {
    const target = page.locator(`#message-${messageId}`);
    await expect(target).toHaveClass(/message-target/);
    await expect(target).toBeInViewport();
    await expect(target).toBeFocused();
}

/** Neither the page nor `box` runs past the screen sideways. */
async function expectNoOverflow(page: Page, box: Locator, width: number): Promise<void> {
    const sizes = await box.evaluate((node) => ({ scroll: node.scrollWidth, client: node.clientWidth, right: node.getBoundingClientRect().right }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
    expect(sizes.right).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

/** Taps 🔖 Bookmark in a Message's actions, through its ⋯ overflow when it didn't fit. */
async function tapBookmark(group: Locator): Promise<void> {
    const bookmark = group.getByRole('button', { name: 'Bookmark' });
    if (!(await bookmark.isVisible())) await group.getByRole('button', { name: 'More actions' }).tap();
    await bookmark.tap();
}

test('search finds a line far up the Chat, in any case, and a tap lands on that Message', async ({ page, request }) => {
    const played = await createLongChat(request);
    try {
        await page.goto(`/stories/${played.storyId}/chats/${played.chatId}`);
        await expect(page.getByRole('article', { name: 'AI reply' })).toHaveCount(TURNS);
        // The thread opens at its end, far from turn 6.
        const compassMessage = played.messageIds[11];
        await expect(page.locator(`#message-${compassMessage}`)).not.toBeInViewport();

        const sheet = await openFind(page);
        const field = sheet.getByRole('searchbox', { name: 'Search this Chat' });
        await expect(field).toBeFocused();
        await field.fill('brass compass');

        const hits = sheet.getByRole('list', { name: 'Results' }).getByRole('button');
        await expect(hits).toHaveCount(1);
        await expect(hits.first()).toContainText('Ash');
        await expect(hits.first()).toContainText('Message 12');
        await expect(hits.first().locator('mark')).toHaveText('brass COMPASS');
        await expect(sheet.getByRole('status')).toHaveText('1 place, newest first.');

        await hits.first().tap();
        await expect(sheet).toBeHidden();
        await expectLandedOn(page, compassMessage);

        // Opening again keeps the search; Thai matches mid-word, naming the Character who said it.
        const again = await openFind(page);
        await expect(again.getByRole('searchbox', { name: 'Search this Chat' })).toHaveValue('brass compass');
        await again.getByRole('searchbox', { name: 'Search this Chat' }).fill('ดวงนี้');
        const thai = again.getByRole('list', { name: 'Results' }).getByRole('button');
        await expect(thai).toHaveCount(1);
        await expect(thai.first()).toContainText('Mira');
        await expect(thai.first().locator('mark')).toHaveText('ดวงนี้');
        await thai.first().tap();
        await expectLandedOn(page, played.messageIds[40]);

        // A word said in every turn: newest first, all of them counted.
        const many = await openFind(page);
        await many.getByRole('searchbox', { name: 'Search this Chat' }).fill('keeper');
        await expect(many.getByRole('status')).toHaveText(`${TURNS} places, newest first.`);
        await expect(many.getByRole('list', { name: 'Results' }).getByRole('button').first()).toContainText(`Message ${played.messageIds.length}`);
        await expectNoOverflow(page, many, 360);
    } finally {
        await cleanUp(request, played);
    }
});

test('a Message bookmarked from its actions is listed in Bookmarks, jumps there, and can be removed', async ({ page, request }) => {
    const played = await createLongChat(request);
    try {
        await page.goto(`/stories/${played.storyId}/chats/${played.chatId}`);
        await expect(page.getByRole('article', { name: 'AI reply' })).toHaveCount(TURNS);

        // Bookmark an older reply from the tools a tap shows under it.
        const reply = page.locator(`#message-${played.messageIds[20]}`);
        await reply.scrollIntoViewIfNeeded();
        await reply.tap();
        await tapBookmark(reply.getByRole('group', { name: 'Message tools' }));
        await expect(reply.getByText('Bookmarked', { exact: true })).toBeVisible();

        // And the newest reply from its action row, where the toggle shows pressed.
        const newest = page.locator(`#message-${played.messageIds.at(-1)}`);
        const row = newest.getByRole('group', { name: 'Message actions' });
        await tapBookmark(row);
        await expect(newest.getByText('Bookmarked', { exact: true })).toBeVisible();

        const sheet = await openFind(page);
        await sheet.getByRole('tab', { name: 'Bookmarks (2)' }).tap();
        const rows = sheet.getByRole('list', { name: 'Bookmarks' }).getByRole('listitem');
        // In thread order, each with who spoke and how it starts.
        await expect(rows).toHaveCount(2);
        await expect(rows.first()).toContainText('Mira');
        await expect(rows.first()).toContainText('Message 21');
        await expect(rows.first()).toContainText('Wind against the glass, turn 10.');
        await expectNoOverflow(page, sheet, 360);

        await rows.first().getByRole('button').first().tap();
        await expect(sheet).toBeHidden();
        await expectLandedOn(page, played.messageIds[20]);

        // Removed from the list: the Message's mark goes too.
        const list = await openFind(page);
        await expect(list.getByRole('tab', { name: 'Bookmarks (2)' })).toHaveAttribute('aria-selected', 'true');
        await list.getByRole('button', { name: 'Remove bookmark: Mira, Message 21' }).tap();
        await expect(list.getByRole('list', { name: 'Bookmarks' }).getByRole('listitem')).toHaveCount(1);
        await list.getByRole('button', { name: 'Close' }).tap();
        await expect(reply.getByText('Bookmarked', { exact: true })).toHaveCount(0);

        // A reload reads them from the API: the newest reply is still marked.
        await page.reload();
        await expect(newest.getByText('Bookmarked', { exact: true })).toBeVisible();
        const stored = await (await request.get(`/api/stories/${played.storyId}/chats/${played.chatId}/bookmarks`)).json();
        expect(stored.bookmarks.map((bookmark: { messageId: number }) => bookmark.messageId)).toEqual([played.messageIds.at(-1)]);
    } finally {
        await cleanUp(request, played);
    }
});

for (const width of [360, 320]) {
    test(`at ${width}px the top bar, the Find sheet's tabs, results and bookmarks fit without sideways scrolling`, async ({ page, request }) => {
        await page.setViewportSize({ width, height: 700 });
        const played = await createLongChat(request);
        await request.put(`/api/stories/${played.storyId}/chats/${played.chatId}/messages/${played.messageIds[0]}/bookmark`);
        try {
            await page.goto(`/stories/${played.storyId}/chats/${played.chatId}`);
            const header = page.locator('header').filter({ has: page.getByRole('button', { name: 'Search this Chat' }) });
            await expectNoOverflow(page, header, width);
            // Every button in the top bar is a full 44px target.
            for (const button of await header.getByRole('button').all()) {
                const box = await button.boundingBox();
                expect(box!.height).toBeGreaterThanOrEqual(44);
            }

            const sheet = await openFind(page);
            await sheet.getByRole('searchbox', { name: 'Search this Chat' }).fill('Wind against the glass');
            await expect(sheet.getByRole('list', { name: 'Results' }).getByRole('button')).toHaveCount(TURNS - 1);
            await expectNoOverflow(page, sheet, width);
            for (const tab of await sheet.getByRole('tab').all()) expect((await tab.boundingBox())!.height).toBeGreaterThanOrEqual(44);

            await sheet.getByRole('tab', { name: /Bookmarks/ }).tap();
            await expect(sheet.getByRole('list', { name: 'Bookmarks' }).getByRole('listitem')).toHaveCount(1);
            await expectNoOverflow(page, sheet, width);
        } finally {
            await cleanUp(request, played);
        }
    });
}

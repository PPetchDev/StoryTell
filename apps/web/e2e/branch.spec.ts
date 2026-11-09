import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Branch (.scratch/branch/spec.md) is played on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

interface Played {
    storyId: number;
    chatId: number;
    messageIds: number[];
}

/** A playable Story with a Chat two turns in, all through the API, so the browser covers only the Branch. */
async function createPlayedChat(request: APIRequestContext): Promise<Played> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper, arrived this morning.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });

    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: {
            kind: 'turn',
            replies: [
                { text: '@Mira: Took you long enough.', model: 'glm-5.3' },
                { text: 'She points at the stairs.', model: 'glm-5.3' },
            ],
        },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE, NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS, NO_OPS] } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    let messageIds: number[] = [];
    for (const text of ['I set my boots by the door.', 'Where is the lamp room?']) {
        const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text } });
        expect(sent.ok()).toBe(true);
        messageIds = ((await sent.json()).messages as Array<{ id: number }>).map((message) => message.id);
    }
    // Both background calls settle at once with the fake gateway; wait so nothing is pending.
    await expect
        .poll(async () => {
            const body = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
            return body.messages.at(-1).judge.status;
        })
        .toBe('done');
    return { storyId, chatId, messageIds };
}

/** The new Chat's id, once the app has moved to it. */
async function openedChat(page: Page, played: Played): Promise<number> {
    await expect(page).not.toHaveURL(new RegExp(`/chats/${played.chatId}($|[#?])`));
    const match = /\/chats\/(\d+)/.exec(page.url());
    if (!match) throw new Error(`Not on a Chat: ${page.url()}`);
    return Number(match[1]);
}

/** Taps ⑂ Branch in a group of actions, through its ⋯ overflow when it didn't fit. */
async function tapBranch(group: Locator): Promise<void> {
    const branch = group.getByRole('button', { name: 'Branch' });
    if (!(await branch.isVisible())) await group.getByRole('button', { name: 'More actions' }).tap();
    await branch.tap();
}

/** Neither the row nor the page runs past the screen sideways. */
async function expectNoOverflow(page: Page, group: Locator): Promise<void> {
    await expect(group).toBeVisible();
    const sizes = await group.evaluate((row) => ({ scroll: row.scrollWidth, client: row.clientWidth, right: row.getBoundingClientRect().right }));
    expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
    expect(sizes.right).toBeLessThanOrEqual(390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

test('⑂ Branch on an earlier reply opens "Chat 1 (branch)" ending on it, and the original stays intact', async ({ page, request }) => {
    const played = await createPlayedChat(request);
    try {
        await page.goto(`/stories/${played.storyId}/chats/${played.chatId}`);
        const replies = page.getByRole('article', { name: 'AI reply' });
        await expect(replies).toHaveCount(2);

        // An earlier reply shows ✎ Edit · ไทย · ⑂ Branch once tapped, ⑂ last (integration: "Message actions").
        await replies.first().tap();
        const tools = replies.first().getByRole('group', { name: 'Message tools' });
        await expect(tools.getByRole('button')).toHaveText(['✎Edit', 'ไทย', '⑂Branch']);
        await tapBranch(tools);

        const branchId = await openedChat(page, played);
        await expect(page.getByRole('heading', { name: 'Chat 1 (branch)' })).toBeVisible();
        await expect(page.getByRole('status').filter({ hasText: 'Branched from Chat 1.' })).toBeVisible();
        await expect(page.getByRole('article', { name: 'AI reply' })).toHaveCount(1);
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Took you long enough.');
        await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(1);
        await expect(page.getByRole('textbox', { name: 'Write as Ash' })).toHaveValue('');
        expect(branchId).not.toBe(played.chatId);

        // Back: the original, every Message still there.
        await page.goBack();
        await expect(page.getByRole('heading', { name: 'Chat 1', exact: true })).toBeVisible();
        await expect(page.getByRole('article', { name: 'AI reply' })).toHaveCount(2);
        await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(2);
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('She points at the stairs.');
    } finally {
        await request.delete('/api/testing/fake-gateway');
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${played.storyId}`);
    }
});

test("at 390px neither the newest reply's action row nor a tapped Message's tools overflow, and ⑂ is reachable from the row", async ({ page, request }) => {
    const played = await createPlayedChat(request);
    // ↺ Again once, so the row holds the most it can: ‹ n/m ›, ↺, ✎, 📷 and ⑂.
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: 'Mira shrugs.', model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    expect((await request.post(`/api/stories/${played.storyId}/chats/${played.chatId}/messages/${played.messageIds[4]}/regenerate`)).ok()).toBe(true);
    try {
        await page.goto(`/stories/${played.storyId}/chats/${played.chatId}`);
        const actions = page.getByRole('group', { name: 'Message actions' });
        await expect(actions.getByRole('group', { name: 'Reply versions' })).toBeVisible();
        await expectNoOverflow(page, actions);

        const said = page.getByRole('article', { name: 'Ash said' }).first();
        await said.tap();
        await expectNoOverflow(page, said.getByRole('group', { name: 'Message tools' }));
        await page.getByRole('article', { name: 'Opening' }).tap();
        await expectNoOverflow(page, page.getByRole('article', { name: 'Opening' }).getByRole('group', { name: 'Message tools' }));

        // ⑂ from the newest reply's row: the Branch keeps its Reply versions.
        await tapBranch(actions);
        await openedChat(page, played);
        await expect(page.getByRole('heading', { name: 'Chat 1 (branch)' })).toBeVisible();
        await expect(page.getByRole('article', { name: 'AI reply' })).toHaveCount(2);
        await expect(page.getByRole('group', { name: 'Reply versions' })).toContainText('2/2');
    } finally {
        await request.delete('/api/testing/fake-gateway');
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${played.storyId}`);
    }
});

test('the Chat menu\'s "Branched from" line leads back to the Message, the Chat list shows it, and both go once the original is deleted', async ({ page, request }) => {
    const played = await createPlayedChat(request);
    const tapped = played.messageIds[2];
    const made = await request.post(`/api/stories/${played.storyId}/chats/${played.chatId}/messages/${tapped}/branch`);
    expect(made.ok()).toBe(true);
    const branchId = (await made.json()).id as number;
    try {
        await page.goto(`/stories/${played.storyId}/chats/${branchId}`);
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        const menu = page.getByRole('dialog', { name: 'Chat menu' });
        const back = menu.getByRole('link').first();
        await expect(back).toContainText('Branched from Chat 1');
        await back.tap();

        await expect(page).toHaveURL(new RegExp(`/stories/${played.storyId}/chats/${played.chatId}#message-${tapped}$`));
        await expect(page.getByRole('heading', { name: 'Chat 1', exact: true })).toBeVisible();
        await expect(page.locator(`#message-${tapped}`)).toHaveClass(/message-target/);

        await page.goto(`/stories/${played.storyId}/chats`);
        const list = page.getByRole('list', { name: 'Chats' });
        await expect(list.getByRole('listitem').first()).toContainText('Chat 1 (branch)');
        await expect(list.getByRole('listitem').first()).toContainText('Branched from Chat 1');
        await expect(list.getByRole('listitem').last()).not.toContainText('Branched from');

        expect((await request.delete(`/api/stories/${played.storyId}/chats/${played.chatId}`)).ok()).toBe(true);
        await page.reload();
        await expect(list.getByRole('listitem')).toHaveCount(1);
        await expect(list).not.toContainText('Branched from');
        await page.goto(`/stories/${played.storyId}/chats/${branchId}`);
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await expect(page.getByRole('dialog', { name: 'Chat menu' })).not.toContainText('Branched from');
    } finally {
        await request.delete('/api/testing/fake-gateway');
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${played.storyId}`);
    }
});

test("⑂ on a User Message opens the Branch on the reply before it, with that text in the composer, and runs no turn", async ({ page, request }) => {
    const played = await createPlayedChat(request);
    try {
        await page.goto(`/stories/${played.storyId}/chats/${played.chatId}`);
        const said = page.getByRole('article', { name: 'Ash said' }).last();
        await said.tap();
        await tapBranch(said.getByRole('group', { name: 'Message tools' }));

        const branchId = await openedChat(page, played);
        await expect(page.getByRole('heading', { name: 'Chat 1 (branch)' })).toBeVisible();
        const box = page.getByRole('textbox', { name: 'Write as Ash' });
        await expect(box).toHaveValue('Where is the lamp room?');
        await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(1);
        await expect(page.getByRole('article', { name: 'AI reply' })).toHaveCount(1);
        await expect(page.getByText('Writing…')).toHaveCount(0);
        // The draft never went through the URL, and no model was called.
        expect(page.url()).not.toContain('lamp');
        const calls = (await (await request.get('/api/testing/fake-gateway/calls')).json()).calls as Array<{ request: { kind: string } }>;
        expect(calls.filter((call) => call.request?.kind === 'turn')).toHaveLength(2);

        // A reload does not put the draft back a second time.
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Chat 1 (branch)' })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Write as Ash' })).toHaveValue('');
        expect(branchId).toBeGreaterThan(played.chatId);
    } finally {
        await request.delete('/api/testing/fake-gateway');
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${played.storyId}`);
    }
});

test('while the Story is unplayable a tapped User Message offers ⑂ Branch alone, and with it playable ✎ Edit · ⑂ Branch', async ({ page, request }) => {
    const played = await createPlayedChat(request);
    try {
        await page.goto(`/stories/${played.storyId}/chats/${played.chatId}`);
        const said = page.getByRole('article', { name: 'Ash said' }).first();
        await said.tap();
        await expect(said.getByRole('group', { name: 'Message tools' }).getByRole('button')).toHaveText(['✎Edit', 'ไทย', '⑂Branch']);

        await request.patch(`/api/stories/${played.storyId}`, { data: { setting: '' } });
        await page.reload();
        await said.tap();
        const tools = said.getByRole('group', { name: 'Message tools' });
        await expect(tools.getByRole('button')).toHaveText(['ไทย', '⑂Branch']);
        await tapBranch(tools);

        await openedChat(page, played);
        await expect(page.getByRole('heading', { name: 'Chat 1 (branch)' })).toBeVisible();
        await expect(page.getByRole('textbox', { name: 'Write as Ash' })).toHaveValue('I set my boots by the door.');
        await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(0);
    } finally {
        await request.delete('/api/testing/fake-gateway');
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${played.storyId}`);
    }
});

test('an API error while branching shows in the usual error line without leaving the Chat', async ({ page, request }) => {
    const played = await createPlayedChat(request);
    try {
        await page.route(`**/api/stories/${played.storyId}/chats/${played.chatId}/messages/*/branch`, (route) =>
            route.fulfill({
                status: 409,
                contentType: 'application/json',
                json: { error: { code: '409.004.007', message: 'The previous turn is still saving its Memory, Bonds, Arcs and Scene. Try again in a moment.' } },
            }),
        );
        await page.goto(`/stories/${played.storyId}/chats/${played.chatId}`);
        await page.getByRole('article', { name: 'Opening' }).tap();
        await tapBranch(page.getByRole('article', { name: 'Opening' }).getByRole('group', { name: 'Message tools' }));

        await expect(page.getByRole('alert').filter({ hasText: 'still saving' })).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/chats/${played.chatId}$`));
        await expect(page.getByRole('heading', { name: 'Chat 1', exact: true })).toBeVisible();
        // The actions come back for another try.
        await expect(page.getByRole('group', { name: 'Message actions' }).getByRole('button', { name: 'Edit' })).toBeVisible();
    } finally {
        await request.delete('/api/testing/fake-gateway');
        // Leaves the shared e2e database as it was found, Chats included.
        await request.delete(`/api/stories/${played.storyId}`);
    }
});

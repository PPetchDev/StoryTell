import { APIRequestContext, expect, Page, test } from '@playwright/test';

// The composer and the action row are used on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

/** Scripts the fake for these turn replies, each with background calls that change nothing. */
async function scriptTurns(request: APIRequestContext, replies: string[]): Promise<void> {
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'turn', replies: replies.map((text) => ({ text, model: 'glm-5.3' })) },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: replies.map(() => NO_CHANGE) } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: replies.map(() => NO_OPS) } });
}

/** A playable Story with a Chat, played `lines.length` turns through the API. */
async function createPlayedChat(request: APIRequestContext, lines: string[]): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.delete('/api/testing/fake-gateway');
    await scriptTurns(request, lines.map((_, n) => `@Mira: Answer ${n + 1}.`));
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    for (const text of lines) {
        const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text } });
        expect(sent.ok()).toBe(true);
    }
    return { storyId, chatId };
}

test('only the newest reply shows its actions; an older Message shows Edit when tapped and hides it again', async ({ page, request }) => {
    const { storyId, chatId } = await createPlayedChat(request, ['I set my boots by the door.', 'Where is the lamp room?']);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const thread = page.getByRole('region', { name: 'Messages' });
        const replies = page.getByRole('article', { name: 'AI reply' });
        await expect(replies).toHaveCount(2);

        // The newest reply carries its action row; nothing else offers Edit.
        const actions = page.getByRole('group', { name: 'Message actions' });
        await expect(actions).toHaveCount(1);
        await expect(replies.last().getByRole('group', { name: 'Message actions' })).toBeVisible();
        await expect(actions.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(actions.getByRole('button', { name: 'Snapshot' })).toBeVisible();
        await expect(thread.getByRole('button', { name: 'Edit' })).toHaveCount(1);

        // A tap on an older Message shows its Edit; a second tap hides it.
        const first = page.getByRole('article', { name: 'Ash said' }).first();
        await first.tap();
        await expect(first.getByRole('button', { name: 'Edit' })).toBeVisible();
        await expect(thread.getByRole('button', { name: 'Edit' })).toHaveCount(2);
        await first.tap();
        await expect(first.getByRole('button', { name: 'Edit' })).toHaveCount(0);

        // A tap elsewhere hides it too, and a tap on another Message moves it there.
        const opening = page.getByRole('article', { name: 'Opening' });
        await first.tap();
        await expect(first.getByRole('button', { name: 'Edit' })).toBeVisible();
        await opening.tap();
        await expect(first.getByRole('button', { name: 'Edit' })).toHaveCount(0);
        await expect(opening.getByRole('button', { name: 'Edit' })).toBeVisible();
        await page.getByRole('form', { name: 'Composer' }).tap();
        await expect(thread.getByRole('button', { name: 'Edit' })).toHaveCount(1);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

/** Holds the Chat's send back until `release` is called, so a test can look at the screen meanwhile. */
async function holdSend(page: Page, storyId: number, chatId: number): Promise<() => void> {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/api/stories/${storyId}/chats/${chatId}/messages`, async (route) => {
        await held;
        await route.continue();
    });
    return release;
}

test('the composer is one row that grows, Enter on the phone is a new line, and the actions hide while the reply is written', async ({
    page,
    request,
}) => {
    const { storyId, chatId } = await createPlayedChat(request, ['I set my boots by the door.']);
    await scriptTurns(request, ['@Mira: The lamp room is up the stairs.']);
    const release = await holdSend(page, storyId, chatId);

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const box = composer.getByRole('textbox', { name: 'Write as Ash' });
        const send = composer.getByRole('button', { name: 'Send' });
        await expect(page.getByRole('group', { name: 'Message actions' })).toBeVisible();

        // One row, naming the worn identity, with nothing to send yet.
        await expect(box).toHaveAttribute('placeholder', /Ash/);
        await expect(composer.getByRole('textbox')).toHaveCount(1);
        await expect(send).toBeDisabled();
        const oneRow = (await box.boundingBox())!.height;
        expect(oneRow).toBeLessThan(56);

        // The on-screen keyboard has no Shift+Enter, so Enter is a new line; the box grows with it.
        await box.pressSequentially('Where is');
        await box.press('Enter');
        await box.pressSequentially('the lamp room?');
        await expect(box).toHaveValue('Where is\nthe lamp room?');
        await expect(send).toBeEnabled();
        await expect.poll(async () => (await box.boundingBox())!.height).toBeGreaterThan(oneRow + 10);

        // It grows to about five lines, then scrolls.
        await box.fill(Array.from({ length: 12 }, (_, n) => `Line ${n + 1}`).join('\n'));
        const tall = (await box.boundingBox())!.height;
        expect(tall).toBeGreaterThan(oneRow * 3);
        expect(tall).toBeLessThan(oneRow * 4);
        expect(await box.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
        await box.fill('Where is\nthe lamp room?');

        // The button sends: the box clears, shrinks back, and no action shows while the reply is written.
        await send.tap();
        await expect(box).toHaveValue('');
        await expect(page.getByRole('article', { name: 'Ash said' }).last()).toContainText('the lamp room?');
        await expect(page.getByRole('status').filter({ hasText: 'Writing' })).toBeVisible();
        await expect(page.getByRole('group', { name: 'Message actions' })).toHaveCount(0);
        await page.getByRole('article', { name: 'Ash said' }).first().tap();
        await expect(page.getByRole('region', { name: 'Messages' }).getByRole('button', { name: 'Edit' })).toHaveCount(0);
        await expect.poll(async () => (await box.boundingBox())!.height).toBeLessThanOrEqual(oneRow + 1);

        // The reply lands and carries the action row.
        release();
        const reply = page.getByRole('article', { name: 'AI reply' }).last();
        await expect(reply).toContainText('The lamp room is up the stairs.');
        await expect(reply.getByRole('group', { name: 'Message actions' })).toBeVisible();
        await expect(page.getByRole('group', { name: 'Message actions' })).toHaveCount(1);
    } finally {
        release();
        await request.delete(`/api/stories/${storyId}`);
    }
});

test.describe('on a physical keyboard', () => {
    test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

    test('Shift+Enter is a new line and Enter sends', async ({ page, request }) => {
        const { storyId, chatId } = await createPlayedChat(request, ['I set my boots by the door.']);
        await scriptTurns(request, ['@Mira: The lamp room is up the stairs.']);

        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const box = page.getByRole('textbox', { name: 'Write as Ash' });
            await box.pressSequentially('Where is');
            await box.press('Shift+Enter');
            await box.pressSequentially('the lamp room?');
            await expect(box).toHaveValue('Where is\nthe lamp room?');

            await box.press('Enter');
            await expect(box).toHaveValue('');
            await expect(page.getByRole('article', { name: 'Ash said' }).last()).toContainText('the lamp room?');
            await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('The lamp room is up the stairs.');
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

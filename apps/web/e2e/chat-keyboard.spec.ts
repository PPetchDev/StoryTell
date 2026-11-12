import { APIRequestContext, expect, Page, test } from '@playwright/test';

// The Chat screen from the keyboard and to a screen reader (docs/ui-audit.md: H7, H8, H10, M23).

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

async function playableChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.delete('/api/testing/fake-gateway');
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

/** Scripts turn replies, each with a judge and an extraction that change nothing. */
async function scriptTurns(request: APIRequestContext, ...replies: (string | object)[]): Promise<void> {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: replies.map(() => NO_CHANGE) } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: replies.map(() => NO_OPS) } });
}

/** A reply written slowly enough to act while it streams. */
const slowly = (text: string) => ({ text, model: 'glm-5.3', pieceSize: 4, pieceDelayMs: 60 });

function composer(page: Page) {
    const form = page.getByRole('form', { name: 'Composer' });
    return { form, box: form.getByRole('textbox', { name: 'Write as Ash' }), send: form.getByRole('button', { name: 'Send' }) };
}

test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

    test('the box keeps focus through a send and the reply, and takes the next line while the reply is written', async ({ page, request }) => {
        const { storyId, chatId } = await playableChat(request);
        await scriptTurns(request, slowly('Rain lashes the glass.\n\n@Mira: You took your time, keeper. Boots off, and mind the oil.'));
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const { box, send } = composer(page);
            await box.tap();
            await box.fill('I shake off the rain.');
            await send.tap();
            const writing = page.getByRole('status').filter({ hasText: 'Writing' });
            await expect(writing).toBeVisible();
            // While the reply is written, the box still has focus and takes the next line.
            await expect(box).toBeFocused();
            await expect(box).toBeEditable();
            await box.pressSequentially('I hang up');
            await expect(writing).toHaveCount(0, { timeout: 20_000 });
            await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('mind the oil');
            await expect(box).toBeFocused();
            await expect(box).toHaveValue('I hang up');
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('a finished reply is said once to a screen reader: that it came, and who speaks in it', async ({ page, request }) => {
        const { storyId, chatId } = await playableChat(request);
        await scriptTurns(request, slowly('@Mira: Boots off, and mind the oil.'));
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const { box, send } = composer(page);
            await box.fill('I shake off the rain.');
            await send.tap();
            // The layout's polite live region says it, once the turn is over.
            const said = page.getByRole('status').filter({ hasText: /^Reply from Mira\.$/ });
            await expect(said).toHaveCount(1);
            await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('mind the oil');
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('the ⋯ menu of an action row closes on Escape and gives focus back to ⋯', async ({ page, request }) => {
        const { storyId, chatId } = await playableChat(request);
        await scriptTurns(request, '@Mira: Boots off, and mind the oil.');
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const { box, send } = composer(page);
            await box.fill('I shake off the rain.');
            await send.tap();
            const reply = page.getByRole('article', { name: 'AI reply' });
            await expect(reply).toContainText('mind the oil');
            // At 390px the newest reply's row doesn't fit: the rest is behind ⋯.
            const actions = reply.getByRole('group', { name: 'Message actions' });
            const more = actions.getByRole('button', { name: 'More actions' });
            await more.focus();
            await page.keyboard.press('Enter');
            const menu = actions.getByRole('group', { name: 'More actions' });
            await expect(menu).toBeVisible();
            await menu.getByRole('button').first().focus();
            await page.keyboard.press('Escape');
            await expect(menu).toHaveCount(0);
            await expect(more).toBeFocused();
            await expect(more).toHaveAttribute('aria-expanded', 'false');

            // It closes when focus leaves it too.
            await page.keyboard.press('Enter');
            await expect(menu).toBeVisible();
            await box.focus();
            await expect(menu).toHaveCount(0);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

test.describe('on a PC', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('the thread is one stop in the Tab order: the arrow keys move between Messages, and Tab goes on to the composer', async ({ page, request }) => {
        const { storyId, chatId } = await playableChat(request);
        await scriptTurns(request, '@Mira: Boots off.', '@Mira: Mind the oil.', '@Mira: The lamp, keeper.');
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const { box } = composer(page);
            for (const line of ['I knock.', 'I come in.', 'I sit.']) {
                await box.fill(line);
                await box.press('Enter');
                await expect(page.getByRole('status').filter({ hasText: 'Writing' })).toHaveCount(0);
            }
            const thread = page.getByRole('region', { name: 'Messages' });
            const articles = thread.locator('article[data-message-id]');
            // The Opening and three exchanges: seven Messages, one of them in the Tab order.
            await expect(articles).toHaveCount(7);
            await expect(thread.locator('article[tabindex="0"]')).toHaveCount(1);

            // From the Chat menu button, Tab reaches the thread's one Message (the newest), then the composer soon after.
            await page.getByRole('button', { name: 'Chat menu' }).focus();
            const stops: string[] = [];
            for (let step = 0; step < 20; step++) {
                await page.keyboard.press('Tab');
                const label = await page.evaluate(() => {
                    const active = document.activeElement as HTMLElement | null;
                    return active?.getAttribute('aria-label') ?? active?.textContent?.trim() ?? '';
                });
                stops.push(label);
                if (label === 'Write as Ash') break;
            }
            expect(stops).toContain('Write as Ash');
            const inThread = stops.filter((label) => /^(Opening|AI reply|Ash said)$/.test(label));
            expect(inThread).toEqual(['AI reply']);
            // Few stops between the thread and the box, however long the Chat: the newest reply's own controls.
            expect(stops.length).toBeLessThan(16);

            // The arrow keys move between Messages; the one focused becomes the thread's stop.
            await articles.last().focus();
            await page.keyboard.press('ArrowUp');
            await expect(articles.nth(5)).toBeFocused();
            await expect(articles.nth(5)).toHaveAttribute('tabindex', '0');
            await expect(articles.last()).toHaveAttribute('tabindex', '-1');
            await page.keyboard.press('Home');
            await expect(articles.first()).toBeFocused();
            await page.keyboard.press('End');
            await expect(articles.last()).toBeFocused();

            // Enter on an older Message shows its tools, as a tap does.
            await page.keyboard.press('ArrowUp');
            await page.keyboard.press('ArrowUp');
            await page.keyboard.press('Enter');
            await expect(articles.nth(4).getByRole('group', { name: 'Message tools' })).toBeVisible();
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Streaming replies (spec: .scratch/streaming/spec.md) are a phone experience: 390px, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

const REPLY = `Rain lashes the gallery glass.

@Mira: You took your time, keeper. Boots off, and mind the oil.

She slides the logbook across the table without looking up.`;

/** A slowly written reply: about two seconds, in pieces the Chat shows as they come. */
const slowly = (text: string) => ({ text, model: 'glm-5.3', pieceSize: 4, pieceDelayMs: 60 });

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
async function scriptTurns(request: APIRequestContext, ...replies: object[]): Promise<void> {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: replies.map(() => NO_CHANGE) } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: replies.map(() => NO_OPS) } });
}

function screen(page: Page) {
    const composer = page.getByRole('form', { name: 'Composer' });
    return {
        composer,
        box: composer.getByRole('textbox', { name: 'Write as Ash' }),
        send: composer.getByRole('button', { name: 'Send' }),
        play: composer.getByRole('button', { name: 'Continue' }),
        stop: composer.getByRole('button', { name: 'Stop' }),
        replies: page.getByRole('article', { name: 'AI reply' }),
        writing: page.getByRole('status').filter({ hasText: 'Writing' }),
    };
}

test('a slowly written reply shows its first words before it finishes, and the finished reply is the stored one', async ({ page, request }) => {
    const { storyId, chatId } = await playableChat(request);
    await scriptTurns(request, slowly(REPLY));
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const { box, send, replies, writing } = screen(page);

        await box.fill('Evening.');
        await send.tap();

        // The first words are there while the reply is still being written, the indicator after them.
        await expect(replies).toHaveCount(1);
        await expect(replies.first()).toContainText('Rain lashes');
        await expect(writing).toBeVisible();
        await expect(replies.first()).not.toContainText('logbook');

        await expect(writing).toHaveCount(0);
        await expect(replies.first()).toContainText('She slides the logbook across the table without looking up.');
        const finished = await replies.first().innerText();
        // Speech shows as Mira's bubble, with her name, as it does once stored.
        await expect(replies.first().getByRole('group', { name: 'Mira' })).toContainText('You took your time, keeper.');

        await page.reload();
        await expect(replies).toHaveCount(1);
        expect(await replies.first().innerText()).toBe(finished);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('■ Stop mid-reply leaves the line with Retry and no reply; Retry then writes the whole reply', async ({ page, request }) => {
    const { storyId, chatId } = await playableChat(request);
    await scriptTurns(request, slowly(REPLY), { text: REPLY, model: 'glm-5.3' });
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const { box, send, stop, replies, writing } = screen(page);

        await box.fill('Evening.');
        await send.tap();
        // While the reply is written, the send button is ■ Stop.
        await expect(stop).toBeVisible();
        await expect(replies.first()).toContainText('Rain lashes');
        await stop.tap();

        await expect(writing).toHaveCount(0);
        await expect(replies).toHaveCount(0);
        await expect(page.getByRole('article', { name: 'Ash said' })).toContainText('Evening.');
        const kept = page.getByRole('status').filter({ hasText: 'Your message is kept' });
        await expect(kept).toBeVisible();
        // A Stop is the user's choice, not a failure: no error shows.
        // Any alert with words in it (Next's route announcer is an empty one).
        await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveCount(0);
        await expect(stop).toHaveCount(0);

        await kept.getByRole('button', { name: 'Retry' }).tap();
        await expect(replies).toHaveCount(1);
        await expect(replies.first()).toContainText('She slides the logbook across the table without looking up.');
        await expect(kept).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the thread follows the growing reply, and scrolling up while it grows is not undone', async ({ page, request }) => {
    const { storyId, chatId } = await playableChat(request);
    const paragraphs = Array.from({ length: 20 }, (_, index) => `Paragraph ${index + 1}: the storm leans on the tower, and the old stairs groan under the weight of the wind.`);
    await scriptTurns(request, { text: paragraphs.join('\n\n'), model: 'glm-5.3', pieceSize: 12, pieceDelayMs: 40 });
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const { play, replies, writing } = screen(page);
        const thread = page.getByRole('region', { name: 'Messages' });
        const fromEnd = () => thread.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);

        await play.tap();
        await expect(replies.first()).toContainText('Paragraph 9:');
        // Taller than the screen by now, and still at its end.
        expect(await thread.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
        await expect.poll(fromEnd).toBeLessThanOrEqual(48);

        // The user scrolls up to reread, and the reply keeps growing below without pulling them down.
        await thread.evaluate((el) => {
            el.scrollTop = 0;
            el.dispatchEvent(new Event('scroll'));
        });
        await expect(replies.first()).toContainText('Paragraph 15:');
        expect(await thread.evaluate((el) => el.scrollTop)).toBeLessThan(50);
        await expect(writing).toHaveCount(0);
        await expect(replies.first()).toContainText('Paragraph 20:');
        expect(await thread.evaluate((el) => el.scrollTop)).toBeLessThan(50);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('▶ Continue and ↺ Again stream too', async ({ page, request }) => {
    const { storyId, chatId } = await playableChat(request);
    const again = `Thunder rolls over the island.\n\n@Mira: Up the stairs. Now.\n\nThe lamp room door bangs open above them.`;
    await scriptTurns(request, slowly(REPLY), slowly(again));
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const { play, replies, writing } = screen(page);

        await play.tap();
        await expect(replies.first()).toContainText('Rain lashes');
        await expect(writing).toBeVisible();
        await expect(replies.first()).not.toContainText('logbook');
        await expect(writing).toHaveCount(0);
        await expect(replies.first()).toContainText('logbook');

        await page.getByRole('group', { name: 'Message actions' }).getByRole('button', { name: 'Again' }).tap();
        await expect(replies.first()).toContainText('Thunder rolls');
        await expect(writing).toBeVisible();
        // The old reply is gone while the new one is written in its place.
        await expect(replies).toHaveCount(1);
        await expect(replies.first()).not.toContainText('Rain lashes');
        await expect(replies.first()).not.toContainText('lamp room door');
        await expect(writing).toHaveCount(0);
        await expect(replies.first()).toContainText('The lamp room door bangs open above them.');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('■ Stop after scrolling up leaves the reader where they are', async ({ page, request }) => {
    const { storyId, chatId } = await playableChat(request);
    const paragraphs = Array.from({ length: 20 }, (_, index) => `Paragraph ${index + 1}: the storm leans on the tower, and the old stairs groan under the weight of the wind.`);
    // A long reply first, so the thread stays taller than the screen once the stopped one is gone.
    await scriptTurns(
        request,
        { text: paragraphs.join('\n\n'), model: 'glm-5.3', pieceSize: 400 },
        { text: paragraphs.join('\n\n'), model: 'glm-5.3', pieceSize: 12, pieceDelayMs: 40 },
    );
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const { play, stop, replies, writing } = screen(page);
        const thread = page.getByRole('region', { name: 'Messages' });

        await play.tap();
        await expect(replies.first()).toContainText('Paragraph 20:');
        await expect(play).toBeEnabled();
        await play.tap();
        await expect(replies.nth(1)).toContainText('Paragraph 3:');
        await thread.evaluate((el) => {
            el.scrollTop = 100;
            el.dispatchEvent(new Event('scroll'));
        });
        await stop.tap();

        await expect(writing).toHaveCount(0);
        await expect(replies).toHaveCount(1);
        expect(await thread.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(400);
        expect(await thread.evaluate((el) => el.scrollTop)).toBeLessThan(150);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

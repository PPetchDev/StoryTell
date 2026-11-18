import { APIRequestContext, expect, Page, test } from '@playwright/test';

// A reply survives the phone sleeping or the connection dropping (.scratch/resume-reply/spec.md).
// A phone experience: 390px, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

const REPLY = `Rain lashes the gallery glass.

@Mira: You took your time, keeper. Boots off, and mind the oil.

She slides the logbook across the table without looking up.`;

/** A slowly written reply, about four seconds: long enough to drop the stream and come back while it is written. */
const slowly = (text: string) => ({ text, model: 'glm-5.3', pieceSize: 4, pieceDelayMs: 100 });

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

/** The play-model calls the API made: exactly one per turn, however often the stream dropped. */
async function turnCalls(request: APIRequestContext): Promise<number> {
    const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as { calls: { method: string; request: { kind: string } }[] };
    return calls.filter((call) => call.request?.kind === 'turn').length;
}

/** The Chat as stored, read past the browser (Playwright's request is not taken offline). */
async function storedKinds(request: APIRequestContext, storyId: number, chatId: number): Promise<string[]> {
    const chat = (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()) as { messages: { kind: string }[] };
    return chat.messages.map((message) => message.kind);
}

function screen(page: Page) {
    const composer = page.getByRole('form', { name: 'Composer' });
    return {
        composer,
        box: composer.getByRole('textbox', { name: 'Write as Ash' }),
        send: composer.getByRole('button', { name: 'Send' }),
        stop: composer.getByRole('button', { name: 'Stop' }),
        replies: page.getByRole('article', { name: 'AI reply' }),
        mine: page.getByRole('article', { name: 'Ash said' }),
        writing: page.getByRole('status').filter({ hasText: 'Writing' }),
        again: page.getByRole('button', { name: /Again/ }),
        kept: page.getByRole('status').filter({ hasText: 'Your message is kept' }),
        alerts: page.getByRole('alert').filter({ hasText: /\S/ }),
    };
}

/** Puts the page in the background and back, as a phone whose screen goes off does. */
async function setHidden(page: Page, hidden: boolean): Promise<void> {
    await page.evaluate((value) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => value });
        document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
}

test('offline mid-reply, back after it finished: the finished reply shows once, with Again and a free composer', async ({ page, context, request }) => {
    const { storyId, chatId } = await playableChat(request);
    await scriptTurns(request, slowly(REPLY));
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const { box, send, stop, replies, mine, writing, again, alerts } = screen(page);

        await box.fill('Evening.');
        await send.tap();
        await expect(replies.first()).toContainText('Rain lashes');
        await context.setOffline(true);

        // The text so far stays, with the indicator: the reply is still coming.
        await expect(replies.first()).toContainText('Rain lashes');
        await expect(writing).toBeVisible();
        // The API writes the reply to the end meanwhile.
        await expect.poll(() => storedKinds(request, storyId, chatId), { timeout: 15_000 }).toEqual(['ai', 'user', 'ai']);

        await context.setOffline(false);
        await expect(writing).toHaveCount(0);
        await expect(replies).toHaveCount(1);
        await expect(replies.first()).toContainText('She slides the logbook across the table without looking up.');
        await expect(mine).toHaveCount(1);
        await expect(alerts).toHaveCount(0);
        await expect(stop).toHaveCount(0);
        await expect(again).toBeVisible();
        await expect(box).toBeEditable();
        expect(await turnCalls(request)).toBe(1);

        await page.reload();
        await expect(replies).toHaveCount(1);
        await expect(mine).toHaveCount(1);
    } finally {
        await context.setOffline(false);
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('offline mid-reply, back while it is written: the text so far, then it carries on live to the end', async ({ page, context, request }) => {
    const { storyId, chatId } = await playableChat(request);
    await scriptTurns(request, { ...slowly(REPLY), pieceDelayMs: 150 });
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const { box, send, replies, writing, again } = screen(page);

        await box.fill('Evening.');
        await send.tap();
        await expect(replies.first()).toContainText('Rain lashes');
        await context.setOffline(true);
        await page.waitForTimeout(800);
        const resumed = page.waitForRequest((request) => /\/chats\/\d+\/turns\/[^/]+$/.test(request.url()) && request.method() === 'GET');
        await context.setOffline(false);
        await resumed;

        // Picked up while still written: more than before, but not the end yet, and still writing.
        await expect(replies.first()).toContainText('You took your time');
        await expect(writing).toBeVisible();
        expect(await storedKinds(request, storyId, chatId)).toEqual(['ai', 'user']);

        await expect(replies.first()).toContainText('She slides the logbook across the table without looking up.');
        await expect(writing).toHaveCount(0);
        await expect(replies).toHaveCount(1);
        await expect(again).toBeVisible();
        expect(await storedKinds(request, storyId, chatId)).toEqual(['ai', 'user', 'ai']);
        expect(await turnCalls(request)).toBe(1);
    } finally {
        await context.setOffline(false);
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the screen off and on mid-reply: the turn is read afresh and finishes once', async ({ page, request }) => {
    const { storyId, chatId } = await playableChat(request);
    await scriptTurns(request, slowly(REPLY));
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const { box, send, replies, mine, writing, again } = screen(page);

        await box.fill('Evening.');
        await send.tap();
        await expect(replies.first()).toContainText('Rain lashes');
        await setHidden(page, true);
        await page.waitForTimeout(300);
        const resumed = page.waitForRequest((request) => /\/chats\/\d+\/turns\/[^/]+$/.test(request.url()));
        await setHidden(page, false);
        await resumed;

        await expect(replies.first()).toContainText('She slides the logbook across the table without looking up.');
        await expect(writing).toHaveCount(0);
        await expect(replies).toHaveCount(1);
        await expect(mine).toHaveCount(1);
        await expect(again).toBeVisible();
        expect(await storedKinds(request, storyId, chatId)).toEqual(['ai', 'user', 'ai']);
        expect(await turnCalls(request)).toBe(1);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a reply that failed while offline shows its error, and the line with Retry, once back', async ({ page, context, request }) => {
    const { storyId, chatId } = await playableChat(request);
    await scriptTurns(request, { ...slowly(REPLY), failAfterPieces: 12 }, { text: REPLY, model: 'glm-5.3' });
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const { box, send, replies, mine, writing, kept, alerts } = screen(page);

        await box.fill('Evening.');
        await send.tap();
        await expect(replies.first()).toContainText('Rain lashes');
        await context.setOffline(true);
        // Past the failure: the API has nothing more to write.
        await page.waitForTimeout(2_000);
        await context.setOffline(false);

        await expect(writing).toHaveCount(0);
        await expect(replies).toHaveCount(0);
        await expect(mine).toContainText('Evening.');
        await expect(alerts.first()).toBeVisible();
        await expect(kept).toBeVisible();
        // The draft is not put back: the line is stored and waits for Retry.
        await expect(box).toHaveValue('');

        await kept.getByRole('button', { name: 'Retry' }).tap();
        await expect(replies).toHaveCount(1);
        await expect(replies.first()).toContainText('She slides the logbook');
        expect(await storedKinds(request, storyId, chatId)).toEqual(['ai', 'user', 'ai']);
    } finally {
        await context.setOffline(false);
        await request.delete(`/api/stories/${storyId}`);
    }
});

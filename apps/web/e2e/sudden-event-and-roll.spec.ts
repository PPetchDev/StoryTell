import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Sudden events (.scratch/sudden-events/spec.md) and Rolls (.scratch/roll/spec.md), on a phone.
// A Sudden event is the author's: when its trigger happens the Chat shows a Gauge, and the user has
// a few replies to move it. A Roll is the user's: the app throws a d20 for one Message.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';

function judgement(suddenEvent?: Record<string, unknown>): string {
    return JSON.stringify({
        bond_changes: [],
        arc_steps: [],
        scene: { move_on: false, reason: 'nothing yet' },
        ...(suddenEvent ? { sudden_event: suddenEvent } : {}),
    });
}

async function createStory(request: APIRequestContext): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse', setting: 'A lighthouse on a storm-cut island.', opening: OPENING } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' } });
    return storyId;
}

async function createChat(request: APIRequestContext, storyId: number): Promise<number> {
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return (await chat.json()).id as number;
}

/** One turn reply, with what its judge says and an extraction that adds nothing. */
async function scriptTurn(request: APIRequestContext, reply: string, judge = judgement()) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [judge] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

/** The last turn's closing message, as the API sent it to the model. */
async function lastTurnTrailing(request: APIRequestContext): Promise<string> {
    const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as {
        calls: Array<{ request: { kind?: string; messages?: Array<{ content: string }> } }>;
    };
    return calls.filter((call) => call.request?.kind === 'turn').at(-1)!.request.messages!.at(-1)!.content;
}

async function send(page: Page, text: string) {
    const composer = page.getByRole('form', { name: 'Composer' });
    await composer.getByRole('textbox', { name: 'Write as Ash' }).fill(text);
    await composer.getByRole('button', { name: 'Send' }).tap();
}

const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

test('a Roll is armed for one Message: the app throws the dice, the Message keeps the result, and the Narrator is told', async ({ page, request }) => {
    const storyId = await createStory(request);
    const chatId = await createChat(request, storyId);
    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/dice', { data: { rolls: [14] } });
    await scriptTurn(request, 'The lock gives with a click.');
    const bodies: Array<Record<string, unknown>> = [];
    page.on('request', (sent) => {
        if (sent.method() === 'POST' && new URL(sent.url()).pathname.endsWith('/messages')) bodies.push(JSON.parse(sent.postData() ?? '{}'));
    });
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const dice = composer.getByRole('button', { name: 'Roll the dice for this message' });
        await expect(dice).toHaveAttribute('aria-pressed', 'false');
        await expect(composer.locator('[data-band="roll"]')).toHaveCount(0);

        await dice.tap();
        await expect(dice).toHaveAttribute('aria-pressed', 'true');
        await expect(composer.locator('[data-band="roll"]')).toContainText('The dice decide your next message: 11 or more succeeds.');
        await noSidewaysScroll(page);
        // A second tap takes it back, and a third arms it again.
        await dice.tap();
        await expect(composer.locator('[data-band="roll"]')).toHaveCount(0);
        await dice.tap();

        await send(page, 'I pick the lock.');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('The lock gives with a click.');
        const mine = page.getByRole('article', { name: 'Ash said' }).last();
        await expect(mine.locator('[data-roll]')).toHaveText(/Roll: ?14\s*needed 11\s*Success/);
        await expect(dice).toHaveAttribute('aria-pressed', 'false');
        await expect(composer.locator('[data-band="roll"]')).toHaveCount(0);
        expect(bodies).toEqual([{ text: 'I pick the lock.', roll: true }]);
        expect(await lastTurnTrailing(request)).toContain('a success (14, needing 11 or more). It works.');
        await noSidewaysScroll(page);

        // The next Message goes without one.
        await scriptTurn(request, 'The stairs wind up into the dark.');
        await send(page, 'I go in.');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('The stairs wind up');
        expect(bodies.at(-1)).toEqual({ text: 'I go in.' });
        await expect(page.getByRole('article', { name: 'Ash said' }).last().locator('[data-roll]')).toHaveCount(0);
        // The Roll stays on the Message it was thrown for, through a reload.
        await page.reload();
        await expect(page.locator('[data-roll]')).toHaveCount(1);
        await expect(page.locator('[data-roll]')).toContainText('Success');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a Sudden event shows its Gauge from its trigger to its end: each reply moves it, and the outcome stays until the next reply', async ({ page, request }) => {
    const storyId = await createStory(request);
    const added = await request.post(`/api/stories/${storyId}/sudden-events`, {
        data: { name: 'The interrogation', trigger: 'Mira questions Ash about the missing oil.', gauge: 'Suspicion', turns: 3, success: 'Mira shares the watch.' },
    });
    expect(added.ok()).toBe(true);
    const chatId = await createChat(request, storyId);
    await request.delete('/api/testing/fake-gateway');
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const banner = page.getByRole('region', { name: 'Sudden event' });
        const gauge = banner.getByRole('meter', { name: 'Suspicion' });
        await expect(banner).toHaveCount(0);

        await scriptTurn(request, '@Mira: Where is the oil, keeper?', judgement({ start: 1, reason: 'Mira asks about the oil.' }));
        await send(page, 'Good evening.');
        await expect(banner).toContainText('The interrogation');
        await expect(banner).toContainText('3 replies left');
        await expect(banner).toContainText('Suspicion 60');
        await expect(banner).toContainText('Goal: 20 or lower');
        await expect(banner).toContainText('Mira asks about the oil.');
        await expect(gauge).toHaveAttribute('aria-valuenow', '60');
        await expect(gauge).toHaveAttribute('aria-valuetext', '60 of 100. Goal: 20 or lower.');
        await noSidewaysScroll(page);

        await scriptTurn(request, '@Mira: Show me.', judgement({ gauge: 40, reason: 'The ledger backs you up.' }));
        await send(page, 'I show her the ledger.');
        await expect(gauge).toHaveAttribute('aria-valuenow', '40');
        await expect(banner).toContainText('2 replies left');
        await expect(banner).toContainText('The ledger backs you up.');
        // The reply was written with the event under way.
        expect(await lastTurnTrailing(request)).toContain('A sudden event is under way: The interrogation. Suspicion stands at 60 of 100');

        await scriptTurn(request, '@Mira: Fine.', judgement({ gauge: 12, reason: 'She believes you.' }));
        await send(page, 'I tell her the truth.');
        await expect(banner).toContainText('You came through it');
        await expect(banner).toContainText('Suspicion 12');
        await expect(banner).toContainText('She believes you.');
        await expect(banner).toHaveAttribute('data-status', 'success');

        // The next reply shows the outcome in the story, and the banner goes.
        await scriptTurn(request, '@Mira: Take the first watch with me.');
        await page.getByRole('form', { name: 'Composer' }).getByRole('button', { name: 'Continue' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Take the first watch');
        await expect(banner).toHaveCount(0);
        expect(await lastTurnTrailing(request)).toContain('The sudden event The interrogation has just ended: Ash came through it');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Scenes tab adds a Sudden event, saves each field, keeps it through a reload, and removes it', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        await page.goto(`/stories/${storyId}?tab=scenes`);
        await expect(page.getByRole('heading', { name: 'Sudden events' })).toBeVisible();
        await page.getByRole('button', { name: 'Add Sudden event' }).tap();
        const card = page.getByRole('region', { name: 'Sudden event 1', exact: true });
        // A new one opens, and says what it still needs.
        await expect(card.getByText('It starts running once it has a trigger and a Gauge name.')).toBeVisible();

        await card.getByRole('textbox', { name: 'Name' }).fill('The dare');
        await card.getByRole('textbox', { name: 'Starts when' }).fill('Mira dares Ash to climb the gallery.');
        await card.getByRole('textbox', { name: 'Gauge' }).fill('Nerve');
        await expect(card.getByText('It starts running once')).toHaveCount(0);
        const goal = card.getByRole('radiogroup', { name: 'Goal' });
        await expect(goal.getByRole('radio', { name: 'Bring it down' })).toBeChecked();
        await expect(card).toContainText('Nerve starts at 60 of 100. To succeed, bring it to 20 or lower; at 100 it fails at once.');
        await goal.getByRole('radio', { name: 'Bring it up' }).tap();
        await expect(card).toContainText('Nerve starts at 40 of 100. To succeed, bring it to 80 or higher; at 0 it fails at once.');
        const replies = card.getByRole('radiogroup', { name: 'Replies' });
        await expect(replies.getByRole('radio', { name: '4' })).toBeChecked();
        await replies.getByRole('radio', { name: '2' }).tap();
        await card.getByRole('textbox', { name: 'After a success' }).fill('Mira grins.');
        await expect(page.getByText('Saved', { exact: true })).toBeVisible();
        await noSidewaysScroll(page);

        await expect
            .poll(async () => (await (await request.get(`/api/stories/${storyId}`)).json()).suddenEvents)
            .toMatchObject([{ name: 'The dare', trigger: 'Mira dares Ash to climb the gallery.', gauge: 'Nerve', direction: 'raise', turns: 2, success: 'Mira grins.', failure: '' }]);

        await page.reload();
        await expect(card.getByRole('heading', { name: 'The dare' })).toBeVisible();
        await expect(card.getByRole('radiogroup', { name: 'Replies' }).getByRole('radio', { name: '2' })).toBeChecked();

        await card.getByRole('button', { name: 'Remove Sudden event 1' }).tap();
        await page.getByRole('group', { name: 'Remove The dare?' }).getByRole('button', { name: 'Remove' }).tap();
        await expect(card).toHaveCount(0);
        await expect.poll(async () => (await (await request.get(`/api/stories/${storyId}`)).json()).suddenEvents).toEqual([]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

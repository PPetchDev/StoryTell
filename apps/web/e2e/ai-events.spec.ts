import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Sudden events the story makes up (.scratch/ai-events/spec.md), on a phone. With the author's
// switch on, the Judge may propose a Sudden event; the Chat shows it for the user to start or decline.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';
/** The reply that is first offered a new event (AI_EVENT_FIRST_AFTER in the API). */
const FIRST_AFTER = 8;
const PROPOSED = {
    reason: 'Mira has found the torn ledger.',
    name: 'The torn ledger',
    trigger: 'Mira confronts Ash with the torn ledger.',
    gauge: 'Suspicion',
    direction: 'lower',
    turns: 3,
    success: 'Mira hides the ledger.',
    failure: 'Mira reports Ash.',
};

function judgement(fields: { newEvent?: Record<string, unknown>; suddenEvent?: Record<string, unknown> } = {}): string {
    return JSON.stringify({
        bond_changes: [],
        arc_steps: [],
        scene: { move_on: false, reason: 'nothing yet' },
        ...(fields.suddenEvent ? { sudden_event: fields.suddenEvent } : {}),
        new_event: fields.newEvent ?? null,
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

async function scriptTurn(request: APIRequestContext, reply: string, judge = judgement()) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [judge] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

/** A Chat whose eighth reply's judgement proposes `PROPOSED`, played through the API and settled. */
async function proposedChat(request: APIRequestContext, storyId: number): Promise<number> {
    const chatId = ((await (await request.post(`/api/stories/${storyId}/chats`)).json()) as { id: number }).id;
    for (let reply = 1; reply <= FIRST_AFTER; reply++) {
        const last = reply === FIRST_AFTER;
        await scriptTurn(request, last ? '@Mira: Explain this ledger, keeper.' : `@Mira: Line ${reply}.`, judgement(last ? { newEvent: PROPOSED } : {}));
        expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: `Line ${reply}.` } })).ok()).toBe(true);
        await expect
            .poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1).judge?.status)
            .toBe('done');
    }
    return chatId;
}

const noSidewaysScroll = async (page: Page, width: number) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

test('the Scenes tab turns "Let the story make up events" on, and it stays on through a reload', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        await page.goto(`/stories/${storyId}?tab=scenes`);
        const toggle = page.getByRole('switch', { name: 'Let the story make up events' });
        await expect(toggle).toHaveAttribute('aria-checked', 'false');
        await toggle.tap();
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
        await expect.poll(async () => (await (await request.get(`/api/stories/${storyId}`)).json()).aiEvents).toBe(true);
        await noSidewaysScroll(page, 390);
        await page.reload();
        await expect(toggle).toHaveAttribute('aria-checked', 'true');
        // Nothing joins the author's list.
        await expect(page.getByRole('region', { name: 'Sudden event 1', exact: true })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a proposed event shows in the Chat: Not now takes it away, Start it turns it into the event, and it fits a 360 and a 320 phone', async ({ page, request }) => {
    const storyId = await createStory(request);
    await request.put(`/api/stories/${storyId}/ai-events`, { data: { on: true } });
    await request.delete('/api/testing/fake-gateway');
    try {
        const declinedChat = await proposedChat(request, storyId);
        await page.goto(`/stories/${storyId}/chats/${declinedChat}`);
        const card = page.getByRole('region', { name: 'Proposed event' });
        await expect(card).toContainText('The story proposes an event');
        await expect(card).toContainText('The torn ledger');
        await expect(card.locator('[data-proposal-goal]')).toHaveText('Bring Suspicion down to 20 or lower in 3 replies');
        await expect(card).toContainText('Mira has found the torn ledger.');
        await expect(page.getByRole('region', { name: 'Sudden event' })).toHaveCount(0);
        await card.getByRole('button', { name: /^Not now/ }).tap();
        await expect(card).toHaveCount(0);
        await expect(page.getByRole('region', { name: 'Sudden event' })).toHaveCount(0);
        await page.reload();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Explain this ledger');
        await expect(card).toHaveCount(0);

        const startedChat = await proposedChat(request, storyId);
        await page.goto(`/stories/${storyId}/chats/${startedChat}`);
        for (const width of [360, 320]) {
            await page.setViewportSize({ width, height: 740 });
            await expect(card).toBeVisible();
            await noSidewaysScroll(page, width);
            for (const name of [/^Not now/, /^Start it/]) {
                const box = (await card.getByRole('button', { name }).boundingBox())!;
                expect(box.x).toBeGreaterThanOrEqual(0);
                expect(box.x + box.width).toBeLessThanOrEqual(width);
            }
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await card.getByRole('button', { name: /^Start it/ }).tap();
        await expect(card).toHaveCount(0);
        const banner = page.getByRole('region', { name: 'Sudden event' });
        await expect(banner).toContainText('The torn ledger');
        await expect(banner).toContainText('3 replies left');
        await expect(banner.getByRole('meter', { name: 'Suspicion' })).toHaveAttribute('aria-valuenow', '60');
        await expect(banner).toContainText('Mira has found the torn ledger.');

        // It runs as an authored event: the next reply moves its Gauge.
        await scriptTurn(request, '@Mira: Go on.', judgement({ suddenEvent: { gauge: 40, reason: 'A fair answer.' } }));
        const composer = page.getByRole('form', { name: 'Composer' });
        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('I was at the harbour.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(banner.getByRole('meter', { name: 'Suspicion' })).toHaveAttribute('aria-valuenow', '40');
        await expect(banner).toContainText('2 replies left');
        await expect(card).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// "Previously on…" (.scratch/previously-on/spec.md), on a phone: 390px wide, with touch; then measured at 360 and 320.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'Smoke curls from the fire.\n\n@Nara: Drink, guest.';
const STAYS = '{"bond_changes":[],"arc_steps":[],"scene":{"reason":"Not yet.","move_on":false}}';
const NO_OPS = '{"operations":[]}';
const RECAP =
    'Ash came to Nara’s fire a stranger and drank the mare’s milk without flinching. Nara laughed, but her eyes never left the trade goods. Whether the trader can be trusted with the herd’s secret is still unanswered.';

const script = (request: APIRequestContext, kind: string, replies: unknown[]) => request.post('/api/testing/fake-gateway/text', { data: { kind, replies } });

/** Nara's camp and a Chat one reply in, left `hours` ago. */
async function createChat(request: APIRequestContext, hours: number): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Steppe' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: "A herders' camp on the steppe.", opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'A trader passing through.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Nara', appearance: 'Tall.', personality: 'Warm and teasing.', voice: 'Quick.' } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;

    await script(request, 'turn', [{ text: '@Nara: Slowly. It bites.', model: 'glm-5.3' }]);
    await script(request, 'judge', [STAYS]);
    await script(request, 'memory_extraction', [NO_OPS]);
    expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I sip the milk.' } })).ok()).toBe(true);
    await expect
        .poll(async () => {
            const body = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
            return body.messages.at(-1).judge.status as string;
        })
        .toBe('done');
    expect((await request.post(`/api/testing/chats/${chatId}/age`, { data: { hours } })).ok()).toBe(true);
    return { storyId, chatId };
}

const recapCalls = async (request: APIRequestContext): Promise<number> => {
    const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as { calls: Array<{ request?: { kind?: string } }> };
    return calls.filter((call) => call.request?.kind === 'previously_on').length;
};

/** The card fits the phone: nothing wider than the screen, and ✕ is a 44px target on it. */
async function expectFits(page: Page, card: Locator, width: number) {
    await page.setViewportSize({ width, height: 740 });
    await expect(card).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    // It leaves most of the screen to the thread.
    expect(box.height).toBeLessThan(740 * 0.55);
    const close = (await card.getByRole('button', { name: 'Dismiss the recap' }).boundingBox())!;
    expect(close.width).toBeGreaterThanOrEqual(44);
    expect(close.height).toBeGreaterThanOrEqual(44);
    expect(close.x + close.width).toBeLessThanOrEqual(width + 0.5);
    const text = (await card.locator('[data-recap-text]').boundingBox())!;
    expect(text.x + text.width).toBeLessThanOrEqual(width + 0.5);
    // Folded, it leaves the thread most of a short screen (docs/ui-audit-2026-11-21.md, H3).
    expect(box.height).toBeLessThan(740 * 0.3);
}

test('after six hours away the Chat opens on a recap, which fits the phone, stays dismissed, comes back from the menu, and goes on a send', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const { storyId, chatId } = await createChat(request, 7);
    try {
        await script(request, 'previously_on', [RECAP]);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const card = page.locator('[data-recap]');
        await expect(card.getByRole('heading', { name: 'Previously on…' })).toBeVisible();
        await expect(card.getByText(RECAP)).toBeVisible();

        await expectFits(page, card, 360);
        await expectFits(page, card, 320);
        // Read more opens it whole; Show less folds it again.
        const more = card.getByRole('button', { name: 'Read more' });
        await expect(more).toHaveAttribute('aria-expanded', 'false');
        await more.tap();
        await expect(card.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
        await card.getByRole('button', { name: 'Show less' }).tap();
        await expect(more).toBeVisible();
        await page.setViewportSize({ width: 390, height: 844 });

        // Opening it again in the same gap: the same recap, no new call.
        await page.reload();
        await expect(card.getByText(RECAP)).toBeVisible();
        expect(await recapCalls(request)).toBe(1);

        await card.getByRole('button', { name: 'Dismiss the recap' }).tap();
        await expect(card).toHaveCount(0);
        await page.reload();
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Slowly. It bites.');
        await expect(card).toHaveCount(0);

        // From the menu, on demand: the same one again.
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Previously on…/ }).tap();
        await expect(card.getByText(RECAP)).toBeVisible();
        expect(await recapCalls(request)).toBe(1);

        // A new Message: the recap no longer tells where the story is.
        await script(request, 'turn', [{ text: '@Nara: The herd? Ask me tomorrow.', model: 'glm-5.3' }]);
        await script(request, 'judge', [STAYS]);
        await script(request, 'memory_extraction', [NO_OPS]);
        await page.getByLabel('Write as Ash').fill('Where do you keep the herd?');
        await page.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Ask me tomorrow.');
        await expect(card).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a failed recap shows a quiet Try again, which writes it; a Chat played a moment ago shows none', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const away = await createChat(request, 30);
    const fresh = await createChat(request, 0);
    try {
        await script(request, 'previously_on', [{ error: 'outage' }]);
        await page.goto(`/stories/${away.storyId}/chats/${away.chatId}`);
        const card = page.locator('[data-recap]');
        await expect(card.getByText('Couldn’t write the recap.')).toBeVisible();
        // Quiet: no alert.
        await expect(card.getByRole('alert')).toHaveCount(0);
        await page.setViewportSize({ width: 320, height: 740 });
        const retry = (await card.getByRole('button', { name: 'Try again' }).boundingBox())!;
        expect(retry.height).toBeGreaterThanOrEqual(44);
        expect(retry.x + retry.width).toBeLessThanOrEqual(320.5);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

        await script(request, 'previously_on', [RECAP]);
        await card.getByRole('button', { name: 'Try again' }).tap();
        await expect(card.getByText(RECAP)).toBeVisible();

        await page.goto(`/stories/${fresh.storyId}/chats/${fresh.chatId}`);
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Slowly. It bites.');
        await expect(card).toHaveCount(0);
        expect(await recapCalls(request)).toBe(2);

        // Asked for from the menu in a Chat with only its Opening: nothing to recap, and no call.
        const opening = (await (await request.post(`/api/stories/${fresh.storyId}/chats`)).json()).id as number;
        await page.goto(`/stories/${fresh.storyId}/chats/${opening}`);
        await expect(page.getByRole('article', { name: 'Opening' })).toContainText('Smoke curls from the fire.');
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Previously on…/ }).tap();
        await expect(card.getByText('Nothing has happened yet: play a little first.')).toBeVisible();
        expect(await recapCalls(request)).toBe(2);
    } finally {
        await request.delete(`/api/stories/${away.storyId}`);
        await request.delete(`/api/stories/${fresh.storyId}`);
    }
});

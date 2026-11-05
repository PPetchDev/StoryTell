import { expect, test } from '@playwright/test';

// ⚡ is a phone gesture (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';
const SUGGESTED = JSON.stringify({
    suggestions: [
        { kind: 'action', text: 'You pull your boots off and set them by the stove.' },
        { kind: 'speech', text: '"The ferry was late. So was the storm."' },
        { kind: 'move', text: 'You take the logbook from her and read the last entry aloud.' },
    ],
});

test('⚡ offers three replies; a picked one fills the composer, is edited and sent', async ({ page, request }) => {
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
    // The first ask comes back unreadable; the second gives three.
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'suggested_replies', replies: ['Hmm, let me think.', SUGGESTED] } });
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'turn', replies: [{ text: '@Mira: Late ferry. Of course.', model: 'glm-5.3' }] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;

    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const box = composer.getByRole('textbox', { name: 'Write as Ash' });
        const bolt = composer.getByRole('button', { name: 'Suggest replies' });
        const cards = page.getByRole('list', { name: 'Suggested replies' }).getByRole('button');

        // A failed ask says so, and ⚡ again closes it.
        const failed = page.getByRole('alert').filter({ hasText: "Couldn't suggest replies, try again" });
        await bolt.tap();
        await expect(failed).toBeVisible();
        await expect(bolt).toHaveAttribute('aria-pressed', 'true');
        await bolt.tap();
        await expect(failed).toHaveCount(0);
        await expect(bolt).toHaveAttribute('aria-pressed', 'false');

        // Three cards, one of each kind.
        await bolt.tap();
        await expect(cards).toHaveCount(3);
        await expect(cards.nth(0)).toContainText('You pull your boots off');
        await expect(cards.nth(1)).toContainText('"The ferry was late. So was the storm."');
        await expect(cards.nth(2)).toContainText('You take the logbook from her');

        // A card replaces the composer's text and sends nothing; the cards stay until ⚡ or a send.
        await box.fill('Something else.');
        await cards.nth(0).tap();
        await expect(box).toHaveValue('You pull your boots off and set them by the stove.');
        await cards.nth(1).tap();
        await expect(box).toHaveValue('"The ferry was late. So was the storm."');
        await expect(cards).toHaveCount(3);
        await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(0);

        // Edited, then sent: the edited line shows in the thread, and the cards are gone.
        await box.fill('"The ferry was late. So was the storm. So am I, it seems."');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'Ash said' }).last()).toContainText('So am I, it seems.');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Late ferry. Of course.');
        await expect(page.getByRole('list', { name: 'Suggested replies' })).toHaveCount(0);

        // Nothing of the suggestions was kept in the Chat.
        await page.reload();
        await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(1);
        await expect(page.getByText('You take the logbook from her')).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Usage page lists what Suggested replies spent, in plain words', async ({ page }) => {
    const pool = (byKind: object[]) => ({
        spentUsd: 0.432,
        calls: 123,
        byKind,
        remainingUsd: 20,
        capUsd: 22,
        lowCreditPercent: 20,
        lowCredit: false,
    });
    // The fake gateway records no spend, so the page reads a known month.
    await page.route('**/api/usage', (route) =>
        route.fulfill({
            json: {
                month: '2026-11',
                pools: {
                    text: pool([
                        { kind: 'turn', spentUsd: 0.42, calls: 120 },
                        { kind: 'suggested_replies', spentUsd: 0.012, calls: 3 },
                    ]),
                    image: { ...pool([]), spentUsd: 0, calls: 0 },
                },
            },
        }),
    );

    await page.goto('/usage');

    const text = page.getByRole('region', { name: /Text/ });
    const kinds = text.getByRole('list', { name: 'Text spend by kind' }).getByRole('listitem');
    await expect(kinds).toHaveText(['Turns: $0.42 (120 calls)', 'Suggested replies: $0.01 (3 calls)']);
    await expect(page.getByRole('list', { name: 'Image spend by kind' })).toHaveCount(0);
});

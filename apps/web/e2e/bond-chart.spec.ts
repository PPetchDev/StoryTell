import { APIRequestContext, expect, test } from '@playwright/test';

import { openCard } from './harness/editor';

// The Bond chart on the Dashboard (.scratch/bond-axes/issues/03-bond-chart-on-the-dashboard.md),
// read on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';
const JUDGEMENT = JSON.stringify({
    bond_changes: [
        {
            from: 'Mira',
            to: 'user',
            label: 'Curious',
            description: 'She wonders why a keeper would come in a storm.',
            levels: { trust: 0, affection: 1, desire: 0, tension: 1 },
            cause: 'Ash climbed the cliff path in the storm.',
        },
        // Kai's Bond forms with no levels: it is not measured yet.
        { from: 'Kai', to: 'Mira', label: 'Protective', description: 'He keeps an eye on her.', cause: 'Mira snapped at the stranger.' },
    ],
    arc_steps: [],
    scene: { move_on: false, reason: 'Not yet.' },
});

/** A Chat one turn in, whose Judge moved Mira's Bond toward Ash and formed Kai's toward Mira. */
async function createJudgedChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper, arrived this morning.' } });
    const mira = await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    const miraId = (await mira.json()).characters[0].id as number;
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Kai', appearance: 'Wiry, sunburnt.', personality: 'Cheerful, nosy.', voice: 'Rambling.' },
    });
    await request.post(`/api/stories/${storyId}/starting-bonds`, {
        data: { fromCharacterId: miraId, toCharacterId: null, label: 'Wary', description: 'She expects the new keeper to leave.', trust: -1 },
    });

    await request.delete('/api/testing/fake-gateway');
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'turn', replies: [{ text: 'Mira looks up at last.\n\n@Mira: In this weather?', model: 'glm-5.3' }] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [JUDGEMENT] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    const chatId = (await chat.json()).id as number;
    const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I climbed the cliff path in the storm.' } });
    expect(sent.ok()).toBe(true);
    await expect
        .poll(async () => {
            const current = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
            return current.messages[2].judge.status as string;
        })
        .toBe('done');
    return { storyId, chatId };
}

test('a Bond charts its axes in words with no digit, a pin opens its event and Message, and an unmeasured Bond says so', async ({ page, request }) => {
    const { storyId, chatId } = await createJudgedChat(request);
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}/dashboard`);
        const feel = page.getByRole('region', { name: 'How the Characters feel' });

        const bond = (await openCard(feel, 'Mira')).getByRole('group', { name: 'Mira toward Ash' });
        await bond.locator('summary').click();
        const chart = bond.getByRole('group', { name: 'How Mira feels toward Ash over the Chat' });
        await expect(chart).toBeVisible();
        // Each axis by name, with the words at the ends of its scale.
        for (const words of [
            'Trust',
            'betrayed … trusts completely',
            'Affection',
            'hates … devoted',
            'Desire',
            'repelled … aches for',
            'Tension',
            'at ease … at breaking point',
        ]) {
            await expect(chart).toContainText(words);
        }
        // No number anywhere inside the chart: not in its text, nor in what it says to a screen reader.
        await expect(chart).not.toContainText(/\d/);
        expect(await chart.evaluate((node) => node.textContent ?? '')).not.toMatch(/\d/);
        const spoken = await chart.evaluate((node) =>
            [...node.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label') ?? '').join(' '),
        );
        expect(spoken).not.toMatch(/\d/);
        // The chart fits the phone.
        const box = await chart.boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(390);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

        // The label changed from the seed's: one pin, and a tap shows the event and its Message.
        const pin = chart.getByRole('button', { name: 'Turning point: Curious' });
        await expect(chart.getByRole('button', { name: /^Turning point/ })).toHaveCount(1);
        await pin.click();
        const event = bond.getByRole('region', { name: 'Turning point' });
        await expect(event).toContainText('Wary → Curious');
        await expect(event).toContainText('Because: Ash climbed the cliff path in the storm.');
        await event.getByRole('link', { name: 'Go to the Message' }).click();
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats/${chatId}#message-\\d+$`));
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('In this weather?');

        // Kai's Bond toward Mira has no levels: words instead of a chart.
        await page.goto(`/stories/${storyId}/chats/${chatId}/dashboard`);
        const kai = (await openCard(page.getByRole('region', { name: 'How the Characters feel' }), 'Kai')).getByRole('group', { name: 'Kai toward Mira' });
        await kai.locator('summary').click();
        await expect(kai).toContainText('Not measured yet');
        await expect(kai.getByRole('group', { name: /over the Chat$/ })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

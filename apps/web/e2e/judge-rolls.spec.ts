import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Roll offers and Stats (.scratch/judge-rolls/spec.md), on a phone: the author gives the Role a few
// Stats and can turn offers off; at a key moment the Judge offers a Roll above the composer, which
// the user takes (arming the Roll with its Stat) or waves away.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = '@Mira: The guards are coming.';
const NO_OPS = '{"operations":[]}';
/** The written replies before the Judge may offer (ROLL_OFFER_GAP in apps/api/src/manager/chat/roll-offer/roll-offer.ts). */
const GAP = 6;
const STAKES = 'Can you outrun the guards to the gate before it closes?';

function judgement(offer?: { stakes: string; stat: string | null }): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, roll_offer: offer ?? null });
}

async function createStory(request: APIRequestContext): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Gate', setting: 'A walled city at dusk.', opening: OPENING } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'A thief.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Quick.', voice: 'Short.' } });
    return storyId;
}

async function scriptTurn(request: APIRequestContext, reply: string, judge = judgement()) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [judge] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

/** Waits until the newest reply's background calls are done. */
async function settle(request: APIRequestContext, storyId: number, chatId: number) {
    await expect(async () => {
        const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
        const last = chat.messages.at(-1);
        expect(last.kind === 'ai' && last.judge?.status === 'done' && last.memory?.status === 'done').toBe(true);
    }).toPass();
}

/** Plays `count` exchanges through the API, the last one's Judge offering a Roll when `offer` is given. */
async function play(request: APIRequestContext, storyId: number, chatId: number, count: number, offer?: { stakes: string; stat: string | null }) {
    for (let i = 1; i <= count; i++) {
        await scriptTurn(request, `@Mira: Faster! (${i})`, judgement(i === count ? offer : undefined));
        const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: `I run. (${i})` } });
        expect(sent.ok()).toBe(true);
        await settle(request, storyId, chatId);
    }
}

async function send(page: Page, text: string) {
    const composer = page.getByRole('form', { name: 'Composer' });
    await composer.getByRole('textbox', { name: 'Write as Ash' }).fill(text);
    await composer.getByRole('button', { name: 'Send' }).tap();
}

const noSidewaysScroll = async (page: Page, width: number) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

test('the author gives the Role Stats and can turn Roll offers off, on the Role tab', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        await page.goto(`/stories/${storyId}`);
        await page.getByRole('tab', { name: /^Role/ }).tap();
        const card = page.getByRole('region', { name: 'Stats and Rolls' });
        const offers = card.getByRole('switch', { name: /Offer Rolls at key moments/ });
        await expect(offers).toHaveAttribute('aria-checked', 'true');

        await card.getByRole('button', { name: '+ Add a Stat' }).tap();
        // A Stat with no name says why and is not saved.
        await expect(card.getByRole('alert')).toContainText('Give every Stat a name.');
        await card.getByRole('textbox', { name: 'Stat 1 name' }).fill('Strength');
        await card.getByRole('spinbutton', { name: 'Strength number' }).fill('2');
        await card.getByRole('button', { name: '+ Add a Stat' }).tap();
        await card.getByRole('textbox', { name: 'Stat 2 name' }).fill('Charm');
        await card.getByRole('spinbutton', { name: 'Charm number' }).fill('9');
        await expect(card.getByRole('alert')).toContainText('Charm: a whole number from -3 to 5.');
        await card.getByRole('spinbutton', { name: 'Charm number' }).fill('1');
        await expect(card.getByRole('alert')).toHaveCount(0);
        await expect(page.getByText('Saved', { exact: true })).toBeVisible();
        await noSidewaysScroll(page, 390);

        await offers.tap();
        await expect(offers).toHaveAttribute('aria-checked', 'false');
        await expect(page.getByText('Saved', { exact: true })).toBeVisible();
        await expect(async () => {
            const story = await (await request.get(`/api/stories/${storyId}`)).json();
            expect(story.role.stats).toEqual([{ name: 'Strength', value: 2 }, { name: 'Charm', value: 1 }]);
            expect(story.rollOffers).toBe(false);
        }).toPass();

        // Kept through a reload; a removed Stat goes.
        await page.reload();
        await page.getByRole('tab', { name: /^Role/ }).tap();
        await expect(card.getByRole('textbox', { name: 'Stat 2 name' })).toHaveValue('Charm');
        await card.getByRole('button', { name: 'Remove Charm' }).tap();
        await expect(page.getByText('Saved', { exact: true })).toBeVisible();
        await expect(async () => {
            expect((await (await request.get(`/api/stories/${storyId}`)).json()).role.stats).toEqual([{ name: 'Strength', value: 2 }]);
        }).toPass();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Judge offers a Roll above the composer; taking it arms the Roll with its Stat, and the Message shows the Stat added', async ({ page, request }) => {
    // Six turns through the API before the page opens.
    test.slow();
    const storyId = await createStory(request);
    await request.patch(`/api/stories/${storyId}/role`, { data: { stats: [{ name: 'Strength', value: 2 }, { name: 'Charm', value: 1 }] } });
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    await request.delete('/api/testing/fake-gateway');
    const bodies: Array<Record<string, unknown>> = [];
    page.on('request', (sent) => {
        if (sent.method() === 'POST' && new URL(sent.url()).pathname.endsWith('/messages')) bodies.push(JSON.parse(sent.postData() ?? '{}'));
    });
    try {
        await play(request, storyId, chatId, GAP, { stakes: STAKES, stat: 'Strength' });
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const band = composer.getByRole('group', { name: 'Roll offer' });
        await expect(band).toContainText(STAKES);
        await expect(band.getByRole('button', { name: /^Roll the dice for your next message: 11 or more succeeds, \+2 Strength/ })).toHaveText('Roll +2 Strength');

        // Your Stats, in the opened Scene strip.
        const strip = page.getByRole('button', { name: /^Scene:/ });
        await strip.tap();
        await expect(strip.locator('[data-stats]')).toHaveText(/Your Stats\s*Strength \+2 · Charm \+1/);
        await strip.tap();

        // The band on the phone widths the user plays at: the stakes whole, the buttons inside the column.
        for (const width of [360, 320]) {
            await page.setViewportSize({ width, height: 740 });
            await noSidewaysScroll(page, width);
            const box = (await band.boundingBox())!;
            for (const button of await band.getByRole('button').all()) {
                const edge = (await button.boundingBox())!;
                expect(edge.x + edge.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
                expect(edge.height).toBeGreaterThanOrEqual(30);
            }
            await expect(band).toContainText(STAKES);
        }
        await page.setViewportSize({ width: 390, height: 844 });

        // Taking it arms the Roll: the band goes, the armed line says the Stat, and the 🎲 toggle is on.
        await band.getByRole('button', { name: /^Roll the dice/ }).tap();
        await expect(band).toHaveCount(0);
        // "Roll 11 · +2 Strength" on screen; a screen reader also hears "or more succeeds".
        await expect(composer.locator('[data-band="roll"]')).toHaveText(/^Roll 11 or more succeeds, · \+2 Strength$/);
        await expect(composer.locator('[data-band="roll"] .sr-only')).toHaveText(' or more succeeds,');
        await expect(composer.getByRole('button', { name: 'Roll the dice for this message' })).toHaveAttribute('aria-pressed', 'true');
        // Turning the Roll off brings the offer back; taking it again arms it with the Stat again.
        await composer.getByRole('button', { name: 'Roll the dice for this message' }).tap();
        await expect(band).toContainText(STAKES);
        await band.getByRole('button', { name: /^Roll the dice/ }).tap();

        await request.post('/api/testing/fake-gateway/dice', { data: { rolls: [9] } });
        await scriptTurn(request, '@Mira: You made it!', judgement({ stakes: 'Again?', stat: null }));
        await send(page, 'I sprint for the gate.');
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('You made it!');
        expect(bodies.at(-1)).toEqual({ text: 'I sprint for the gate.', roll: true, rollStat: 'Strength' });
        const mine = page.getByRole('article', { name: 'Ash said' }).last();
        await expect(mine.locator('[data-roll]')).toHaveText(/Roll: ?9\s*\+2 Strength\s*needed 11\s*Success/);
        // The reply to a Roll offers none, whatever the Judge said.
        await expect(composer.locator('[data-band="roll"]')).toHaveCount(0);
        await page.reload();
        await expect(page.getByRole('article', { name: 'Ash said' }).last().locator('[data-roll]')).toContainText('+2 Strength');
        await expect(page.getByRole('form', { name: 'Composer' }).getByRole('group', { name: 'Roll offer' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('"Not now" waves an offer away for good, and a Story with offers off shows none', async ({ page, request }) => {
    // Six turns through the API before the page opens.
    test.slow();
    const storyId = await createStory(request);
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    await request.delete('/api/testing/fake-gateway');
    try {
        // No Stats: the offer's button says only "Roll".
        await play(request, storyId, chatId, GAP, { stakes: STAKES, stat: null });
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const band = page.getByRole('form', { name: 'Composer' }).getByRole('group', { name: 'Roll offer' });
        await expect(band.getByRole('button', { name: /^Roll the dice/ })).toHaveText('Roll');
        await band.getByRole('button', { name: 'Not now: no Roll for this' }).tap();
        await expect(band).toHaveCount(0);
        await page.reload();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Faster!');
        await expect(band).toHaveCount(0);

        // Offers off: the Judge's offer is dropped.
        await request.patch(`/api/stories/${storyId}`, { data: { rollOffers: false } });
        await play(request, storyId, chatId, GAP, { stakes: STAKES, stat: null });
        await page.reload();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText(`(${GAP})`);
        await expect(band).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

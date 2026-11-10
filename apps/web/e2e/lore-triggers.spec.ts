import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Lore triggers (.scratch/lore-triggers/spec.md): the More triggers fold on a Lore card, and what
// the Memory drawer's Lore in play says, on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'Dust rises over the market.\n\n@Nara: Welcome, traveller.';

async function createStory(request: APIRequestContext): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Market' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A grassland market.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Petch', description: 'A traveller.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Nara', appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.' },
    });
    return storyId;
}

async function openLoreTab(page: Page, storyId: number): Promise<Locator> {
    await page.goto(`/stories/${storyId}`);
    await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
    return page.getByRole('region', { name: 'Lore' });
}

const moreTriggers = (card: Locator) => card.getByRole('button', { name: /^More triggers/ });

async function saved(page: Page) {
    await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');
}

async function storedLore(request: APIRequestContext, storyId: number): Promise<Array<Record<string, unknown>>> {
    return ((await (await request.get(`/api/stories/${storyId}`)).json()) as { lore: Array<Record<string, unknown>> }).lore;
}

test('More triggers is closed on a new card; second keywords and "Unless one of" autosave and, with the open fold, survive a reload', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        const panel = await openLoreTab(page, storyId);
        await panel.getByRole('button', { name: '+ Add Lore entry' }).tap();
        const card = panel.getByRole('region', { name: 'Lore 1' });
        await card.getByRole('textbox', { name: 'Name' }).fill('Festival');

        // Nothing stored on this device: the card is unfolded and More triggers is closed.
        await expect(card.getByRole('textbox', { name: 'Name' })).toBeVisible();
        await expect(moreTriggers(card)).toHaveAttribute('aria-expanded', 'false');
        await expect(moreTriggers(card)).toHaveText('More triggersNone');
        await expect(card.getByRole('textbox', { name: 'Second keywords' })).toBeHidden();

        await moreTriggers(card).tap();
        await expect(moreTriggers(card)).toHaveAttribute('aria-expanded', 'true');
        await card.getByRole('textbox', { name: 'Second keywords' }).fill('last year, ');
        await card.getByRole('radiogroup', { name: 'Second keywords rule' }).getByRole('radio', { name: 'Unless one of' }).tap();
        await saved(page);
        await expect(card.getByText('Changes here apply to the whole Chat as if they had always been so.')).toBeVisible();
        await expect(moreTriggers(card)).toContainText('Unless: last year');
        expect((await storedLore(request, storyId))[0]).toMatchObject({ secondaryKeywords: ['last year'], secondaryMode: 'unless' });

        await page.reload();
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const reloaded = page.getByRole('region', { name: 'Lore 1' });
        await expect(moreTriggers(reloaded)).toHaveAttribute('aria-expanded', 'true');
        await expect(moreTriggers(reloaded)).toHaveText('More triggersUnless: last year');
        await expect(reloaded.getByRole('textbox', { name: 'Second keywords' })).toHaveValue('last year');
        await expect(reloaded.getByRole('radio', { name: 'Unless one of' })).toBeChecked();

        // Closing it is kept too, and folding the card still works as before.
        await moreTriggers(reloaded).tap();
        await reloaded.getByRole('button', { name: 'Festival' }).tap();
        await page.reload();
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const again = page.getByRole('region', { name: 'Lore 1' });
        await expect(again.getByRole('button', { name: 'Festival' })).toHaveAttribute('aria-expanded', 'false');
        await again.getByRole('button', { name: 'Festival' }).tap();
        await expect(moreTriggers(again)).toHaveAttribute('aria-expanded', 'false');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a broken pattern shows its error under Patterns, opening the fold; fixed, it saves and the header shows "1 pattern"', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Moon', text: 'Two moons.' } });
        const panel = await openLoreTab(page, storyId);
        const card = panel.getByRole('region', { name: 'Lore 1' });
        await moreTriggers(card).tap();
        const patterns = card.getByRole('textbox', { name: 'Patterns' });
        await patterns.fill('(luna');
        // Closed before the save lands: the refusal opens it again.
        await moreTriggers(card).tap();
        await expect(moreTriggers(card)).toHaveAttribute('aria-expanded', 'true');
        await expect(card.getByRole('alert')).toContainText('"(luna" is not a valid regular expression');
        await expect(patterns).toHaveValue('(luna');
        await expect(patterns).toHaveAttribute('aria-invalid', 'true');
        await expect(moreTriggers(card)).toHaveText('More triggersNone');
        expect((await storedLore(request, storyId))[0]).toMatchObject({ patterns: [] });

        await patterns.fill('\b(luna|selene)\b');
        await saved(page);
        await expect(card.getByRole('alert')).toHaveCount(0);
        await expect(moreTriggers(card)).toHaveText('More triggers1 pattern');
        expect((await storedLore(request, storyId))[0]).toMatchObject({ patterns: ['\b(luna|selene)\b'] });

        await page.reload();
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const reloaded = page.getByRole('region', { name: 'Lore 1' });
        await expect(moreTriggers(reloaded)).toHaveText('More triggers1 pattern');
        await expect(reloaded.getByRole('textbox', { name: 'Patterns' })).toHaveValue('\b(luna|selene)\b');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('switching "Brought in by other entries" to No autosaves, survives a reload and shows in the header', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Khan', text: 'The Khan is old.' } });
        const panel = await openLoreTab(page, storyId);
        const card = panel.getByRole('region', { name: 'Lore 1' });
        await moreTriggers(card).tap();
        const field = card.getByRole('radiogroup', { name: 'Brought in by other entries' });
        await expect(field.getByRole('radio', { name: 'Yes' })).toBeChecked();
        await field.getByRole('radio', { name: 'No' }).tap();
        await saved(page);
        await expect(moreTriggers(card)).toHaveText('More triggersNot from other entries');
        expect((await storedLore(request, storyId))[0]).toMatchObject({ recursable: false });

        await page.reload();
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const reloaded = page.getByRole('region', { name: 'Lore 1' });
        await expect(moreTriggers(reloaded)).toHaveText('More triggersNot from other entries');
        await expect(reloaded.getByRole('radiogroup', { name: 'Brought in by other entries' }).getByRole('radio', { name: 'No' })).toBeChecked();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

async function scriptTurn(request: APIRequestContext, reply: string) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

async function send(page: Page, request: APIRequestContext, text: string, reply: string) {
    await scriptTurn(request, reply);
    await page.getByLabel('Write as Petch').fill(text);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(reply.replace(/^@Nara: /, ''))).toBeVisible();
}

async function openLoreInPlay(page: Page): Promise<Locator> {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
    return page.getByRole('complementary', { name: 'Memory' }).getByRole('region', { name: 'Lore in play' });
}

test('Stays for 4 autosaves and shows in the header; after a turn that mentions the entry and one that does not, the drawer says it stays', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Well', text: 'The well is deep.' } });
        const panel = await openLoreTab(page, storyId);
        const card = panel.getByRole('region', { name: 'Lore 1' });
        await moreTriggers(card).tap();
        await card.getByRole('spinbutton', { name: 'Stays for' }).fill('4');
        await saved(page);
        await expect(moreTriggers(card)).toHaveText('More triggersStays 4');
        expect((await storedLore(request, storyId))[0]).toMatchObject({ sticky: 4, cooldown: 0, delay: 0 });

        // Out of range: stays as typed with the reason, and nothing is sent.
        await card.getByRole('spinbutton', { name: 'Rests for' }).fill('51');
        await expect(card.getByRole('alert')).toHaveText('A whole number from 0 to 50.');
        await card.getByRole('spinbutton', { name: 'Rests for' }).fill('0');
        await expect(card.getByRole('alert')).toHaveCount(0);

        // Stays for means nothing for an entry sent on every turn: hidden while Include is Always.
        await card.getByRole('radiogroup', { name: 'Include' }).getByRole('radio', { name: 'Always' }).tap();
        await expect(card.getByRole('spinbutton', { name: 'Stays for' })).toHaveCount(0);
        await card.getByRole('radiogroup', { name: 'Include' }).getByRole('radio', { name: 'When it comes up' }).tap();
        await saved(page);

        await page.reload();
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const reloaded = page.getByRole('region', { name: 'Lore 1' });
        await expect(moreTriggers(reloaded)).toHaveText('More triggersStays 4');
        await expect(reloaded.getByRole('spinbutton', { name: 'Stays for' })).toHaveValue('4');

        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await send(page, request, 'To the well.', '@Nara: Here it is.');
        await send(page, request, 'I wait.', '@Nara: We wait.');
        const inPlay = await openLoreInPlay(page);
        await expect(inPlay.getByRole('list', { name: 'Lore entries in play' }).getByRole('listitem')).toHaveText(['Well · stays 2 more Messages']);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test("the header words every setting as the Story assistant reads them: the spec's all-settings example, and Unless with patterns", async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        // The same entries as the API's pure test of the summary (apps/api/test/lore-triggers.spec.ts).
        await request.post(`/api/stories/${storyId}/lore`, {
            data: {
                name: 'Well',
                text: 'The well is deep.',
                secondaryKeywords: ['night'],
                secondaryMode: 'alsoNeeds',
                patterns: ['a'],
                sticky: 4,
                cooldown: 6,
                delay: 10,
                chance: 50,
                group: 'weather',
                recursable: false,
            },
        });
        await request.post(`/api/stories/${storyId}/lore`, {
            data: { name: 'Feast', text: 'A feast.', secondaryKeywords: ['last year', 'old'], secondaryMode: 'unless', patterns: ['a', 'b', 'c'] },
        });
        const panel = await openLoreTab(page, storyId);

        await expect(moreTriggers(panel.getByRole('region', { name: 'Lore 1' }))).toHaveText(
            'More triggersAlso needs: night · 1 pattern · Stays 4 · Rests 6 · Waits 10 · 50% · Group: weather · Not from other entries',
        );
        await expect(moreTriggers(panel.getByRole('region', { name: 'Lore 2' }))).toHaveText('More triggersUnless: last year, old · 3 patterns');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('Chance 40 autosaves, survives a reload and shows "40%" in the header', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Rumour', text: 'A rumour runs.' } });
        const panel = await openLoreTab(page, storyId);
        const card = panel.getByRole('region', { name: 'Lore 1' });
        await moreTriggers(card).tap();
        await expect(card.getByRole('spinbutton', { name: 'Chance' })).toHaveValue('100');
        await card.getByRole('spinbutton', { name: 'Chance' }).fill('40');
        await saved(page);
        await expect(moreTriggers(card)).toHaveText('More triggers40%');
        expect((await storedLore(request, storyId))[0]).toMatchObject({ chance: 40 });

        await page.reload();
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const reloaded = page.getByRole('region', { name: 'Lore 1' });
        await expect(moreTriggers(reloaded)).toHaveText('More triggers40%');
        await expect(reloaded.getByRole('spinbutton', { name: 'Chance' })).toHaveValue('40');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('two entries of one group, both mentioned in a turn: one is in play, the other in the left-out fold; the header shows the group', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Dry season', keywords: ['dry'], text: 'Dust everywhere.' } });
        await request.post(`/api/stories/${storyId}/lore`, { data: { name: 'Rains', keywords: ['rain'], text: 'Mud everywhere.', group: 'weather', delay: 1 } });
        const panel = await openLoreTab(page, storyId);
        const card = panel.getByRole('region', { name: 'Lore 1' });
        await moreTriggers(card).tap();
        await card.getByRole('textbox', { name: 'Group' }).fill('weather');
        await saved(page);
        await expect(moreTriggers(card)).toHaveText('More triggersGroup: weather');
        await expect(moreTriggers(panel.getByRole('region', { name: 'Lore 2' }))).toHaveText('More triggersWaits 1 · Group: weather');

        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await send(page, request, 'It was dry, but now the rain comes.', '@Nara: The dry days are over.');
        const inPlay = await openLoreInPlay(page);
        // The reply names the dry season last: it came up most recently and takes the group.
        await expect(inPlay.getByRole('list', { name: 'Lore entries in play' }).getByRole('listitem')).toHaveText([
            'Dry season · came up: dry, in the newest Message',
        ]);
        await inPlay.getByText('Came up but left out (1)').click();
        await expect(inPlay.getByRole('list', { name: 'Lore entries left out' }).getByRole('listitem')).toHaveText([
            'Rains · the group weather went to Dry season',
        ]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

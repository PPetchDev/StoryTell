import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Shared Lore (.scratch/shared-lore/spec.md), on a phone: a Lore set is made in one Story's Lore
// tab, linked from another's, edited once for both, unlinked and deleted; a Story's own Lore can be
// moved into a set; and a Chat's prompt carries a linked set's entry.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'Dust hangs over the stalls.\n\n@Nara: Tea?';
const NO_OPS = '{"operations":[]}';
const NO_CHANGE = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'nothing yet' } });

async function createStory(request: APIRequestContext, title: string): Promise<number> {
    const created = await request.post('/api/stories', { data: { title } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A grassland market.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Petch', description: 'A traveller.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Nara', appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.' } });
    return storyId;
}

const storyOf = async (request: APIRequestContext, storyId: number) => (await request.get(`/api/stories/${storyId}`)).json();
const noSidewaysScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

async function openLoreTab(page: Page, storyId: number) {
    await page.goto(`/stories/${storyId}`);
    await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
    await expect(page.getByRole('heading', { name: 'Shared Lore' })).toBeVisible();
}

test('a Lore set made in one Story is linked from another, edited once for both, unlinked and deleted', async ({ page, request }) => {
    const first = await createStory(request, 'The Market');
    const second = await createStory(request, 'The Caravan');
    try {
        await openLoreTab(page, first);
        const shared = page.getByRole('group', { name: 'Shared Lore' });
        await expect(shared).toContainText('a change to the set reaches them all');

        // A new set: named, then given an entry with the same card a Story's own entry has.
        await shared.getByRole('button', { name: '+ New Lore set' }).tap();
        const fresh = shared.getByRole('group', { name: 'Lore set: Lore set' });
        await fresh.getByRole('textbox', { name: 'Lore set name' }).fill('The Steppe');
        const set = shared.getByRole('group', { name: 'Lore set: The Steppe' });
        await expect(set).toContainText('Used by this Story only');
        await set.getByRole('button', { name: '+ Add entry to The Steppe' }).tap();
        const card = set.getByRole('region', { name: 'The Steppe entry 1' });
        await card.getByRole('textbox', { name: 'Name' }).fill('Tents');
        await card.getByRole('textbox', { name: 'Keywords' }).fill('yurt');
        await card.getByRole('textbox', { name: 'Text' }).fill('Round felt tents with a smoke hole.');
        await expect(page.getByText('Saved', { exact: true })).toBeVisible();
        await noSidewaysScroll(page);
        await expect
            .poll(async () => (await storyOf(request, first)).loreSets)
            .toMatchObject([{ name: 'The Steppe', usedBy: 1, entries: [{ name: 'Tents', keywords: ['yurt'], text: 'Round felt tents with a smoke hole.' }] }]);
        // The Story's own Lore is still empty: the entry is the set's.
        expect((await storyOf(request, first)).lore).toEqual([]);

        // The other Story links it from the picker, which says what it holds and who uses it.
        await openLoreTab(page, second);
        await expect(shared.getByRole('group', { name: /^Lore set:/ })).toHaveCount(0);
        await shared.getByRole('button', { name: 'Link a Lore set' }).tap();
        const picker = page.getByRole('dialog', { name: 'Link a Lore set' });
        const row = picker.getByRole('listitem').filter({ hasText: 'The Steppe' });
        await expect(row).toContainText('1 entry · used by The Market');
        await row.getByRole('button', { name: 'Link The Steppe' }).tap();
        await expect(picker).toHaveCount(0);
        await expect(set).toContainText('Used by 2 Stories: a change here reaches them all.');
        await expect(set.getByRole('region', { name: 'The Steppe entry 1' })).toBeVisible();

        // An edit here is the first Story's too.
        const linkedCard = set.getByRole('region', { name: 'The Steppe entry 1' });
        // The card is the one opened when the entry was added: this device remembers it open, in whichever Story shows it.
        await linkedCard.getByRole('textbox', { name: 'Text' }).fill('Round felt tents, struck in an hour.');
        await expect.poll(async () => (await storyOf(request, first)).loreSets[0].entries[0].text).toBe('Round felt tents, struck in an hour.');
        // Linked already: the picker has nothing more to offer.
        await shared.getByRole('button', { name: 'Link a Lore set' }).tap();
        await expect(picker).toContainText('No other Lore sets yet.');
        await page.keyboard.press('Escape');

        // Unlink: gone from this Story, whole for the other.
        await set.getByRole('button', { name: 'Unlink The Steppe from this Story' }).tap();
        await expect(set).toHaveCount(0);
        expect((await storyOf(request, second)).loreSets).toEqual([]);
        // It acted at once, so it offers the way back (docs/ui-audit-2026-11-16.md M5): Undo links the set again, and Unlink is there again.
        await expect(shared).toContainText('Unlinked The Steppe. It is still in your Lore sets.');
        const undo = shared.getByRole('button', { name: 'Undo' });
        await expect(undo).toBeFocused();
        await undo.tap();
        await expect(set).toHaveCount(1);
        await expect.poll(async () => (await storyOf(request, second)).loreSets).toMatchObject([{ name: 'The Steppe', usedBy: 2 }]);
        // Unlink and Delete set stand at the two ends of their row, not side by side.
        const unlinkBox = (await set.getByRole('button', { name: 'Unlink The Steppe from this Story' }).boundingBox())!;
        const deleteBox = (await set.getByRole('button', { name: 'Delete set The Steppe' }).boundingBox())!;
        expect(deleteBox.x - (unlinkBox.x + unlinkBox.width)).toBeGreaterThan(40);
        await set.getByRole('button', { name: 'Unlink The Steppe from this Story' }).tap();
        await expect(set).toHaveCount(0);
        await expect.poll(async () => (await storyOf(request, second)).loreSets).toEqual([]);
        expect((await storyOf(request, first)).loreSets).toMatchObject([{ name: 'The Steppe', usedBy: 1 }]);

        // Delete for good, from the Story that still links it: it asks first, and says what goes.
        await openLoreTab(page, first);
        await set.getByRole('button', { name: 'Delete set The Steppe' }).tap();
        const ask = page.getByRole('group', { name: 'Delete The Steppe for good?' });
        await expect(ask).toContainText('Its 1 entry goes with it.');
        await ask.getByRole('button', { name: 'Delete' }).tap();
        await expect(set).toHaveCount(0);
        await expect.poll(async () => (await storyOf(request, first)).loreSets).toEqual([]);
        expect((await (await request.get('/api/lore-sets')).json()).loreSets).toEqual([]);
    } finally {
        await request.delete(`/api/stories/${first}`);
        await request.delete(`/api/stories/${second}`);
    }
});

test("a Story's own Lore is moved into a new set, and a Chat of another Story that links it is told the entry", async ({ page, request }) => {
    const world = await createStory(request, 'The Market');
    const play = await createStory(request, 'The Caravan');
    await request.post(`/api/stories/${world}/lore`, { data: { name: 'Tents', keywords: ['yurt'], text: 'Round felt tents with a smoke hole.' } });
    await request.post(`/api/stories/${world}/lore`, { data: { name: 'Salt', text: 'Salt is money here.' } });
    await request.delete('/api/testing/fake-gateway');
    try {
        await openLoreTab(page, world);
        const panel = page.getByRole('region', { name: 'Lore', exact: true });
        await expect(panel.getByRole('region', { name: 'Lore 1' })).toBeVisible();
        const shared = page.getByRole('group', { name: 'Shared Lore' });

        await shared.getByRole('button', { name: 'Move this Story’s Lore into a set' }).tap();
        const ask = page.getByRole('group', { name: 'Move this Story’s 2 entries into a new Lore set?' });
        await expect(ask).toContainText('This Story reads them as before');
        await ask.getByRole('button', { name: 'Move' }).tap();

        // Both entries are the set's now, and the Story has none of its own.
        const set = shared.getByRole('group', { name: 'Lore set: Lore set' });
        await expect(set.getByRole('region', { name: 'Lore set entry 2' })).toBeVisible();
        await expect(panel.getByRole('region', { name: 'Lore 1', exact: true })).toHaveCount(0);
        await expect(shared.getByRole('button', { name: 'Move this Story’s Lore into a set' })).toHaveCount(0);
        const moved = await storyOf(request, world);
        expect(moved.lore).toEqual([]);
        expect(moved.loreSets[0].entries.map((entry: { name: string }) => entry.name)).toEqual(['Tents', 'Salt']);

        // The other Story links it, and its Chat's next turn carries the entry that comes up.
        await request.put(`/api/stories/${play}/lore-sets`, { data: { loreSetIds: [moved.loreSets[0].id] } });
        const chatId = (await (await request.post(`/api/stories/${play}/chats`)).json()).id as number;
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: '@Nara: Mind the smoke hole.', model: 'glm-5.3' }] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
        await page.goto(`/stories/${play}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        await composer.getByRole('textbox', { name: 'Write as Petch' }).fill('I duck into the yurt.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Mind the smoke hole.');
        const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as {
            calls: Array<{ request: { kind?: string; messages?: Array<{ content: string }> } }>;
        };
        const trailing = calls.filter((call) => call.request?.kind === 'turn').at(-1)!.request.messages!.at(-1)!.content;
        expect(trailing).toContain('# Lore');
        expect(trailing).toContain('Round felt tents with a smoke hole.');
        expect(trailing).not.toContain('Salt is money here.');
    } finally {
        const left = (await storyOf(request, world)).loreSets as Array<{ id: number }>;
        for (const set of left) await request.delete(`/api/stories/${world}/lore-sets/${set.id}`);
        await request.delete(`/api/stories/${world}`);
        await request.delete(`/api/stories/${play}`);
    }
});

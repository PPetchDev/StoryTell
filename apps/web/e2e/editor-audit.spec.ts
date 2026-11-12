import { APIRequestContext, expect, Page, test } from '@playwright/test';

// The Story editor's audit fixes (docs/ui-audit.md): one-tap removals that undo or ask (H3), an Add
// Document sheet that can always be closed (H6, M18), and async changes said out loud (H11, H12, M16).
// On a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';

interface Made {
    storyId: number;
    miraId: number;
    sceneId: number;
}

/** A playable Story with Mira (two example lines), a Bond, a Belief, and a Scene with a Bond gate. */
async function createStory(request: APIRequestContext, { setting = 'A lighthouse on a storm-cut island, 1890s.' } = {}): Promise<Made> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting, opening: 'The lamp went out an hour ago.' } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    let story = await (
        await request.post(`/api/stories/${storyId}/characters`, {
            data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded.', voice: 'Short sentences.', exampleLines: ['Boots off.', 'Mind the step.'] },
        })
    ).json();
    const miraId = story.characters[0].id as number;
    await request.post(`/api/stories/${storyId}/starting-bonds`, { data: { fromCharacterId: miraId, toCharacterId: null, label: 'wary' } });
    await request.put(`/api/stories/${storyId}/starting-beliefs`, { data: { startingBeliefs: [{ characterId: miraId, text: 'Ash is a smuggler.' }] } });
    story = await (await request.post(`/api/stories/${storyId}/scenes`, { data: { name: 'The storm', situation: 'Light the lamp.' } })).json();
    const sceneId = story.scenes[0].id as number;
    await request.put(`/api/stories/${storyId}/scenes/${sceneId}/gates`, { data: [{ fromCharacterId: miraId, toCharacterId: null, axis: 'trust', atLeast: 1 }] });
    return { storyId, miraId, sceneId };
}

async function stored(request: APIRequestContext, storyId: number) {
    return (await request.get(`/api/stories/${storyId}`)).json();
}

/** What the app's polite live region last said (components/announcer.tsx). */
function said(page: Page, text: string) {
    return page.getByRole('status').filter({ hasText: text });
}

test('one-tap removals act at once with an Undo, and removing a Bond asks first', async ({ page, request }) => {
    const { storyId, sceneId } = await createStory(request);
    try {
        // An example line: gone at once, focus on Undo, said; Undo puts it back and saves it.
        await page.goto(`/stories/${storyId}?tab=characters`);
        const mira = page.getByRole('region', { name: 'Character 1' });
        const lines = mira.getByRole('group', { name: 'Example lines' });
        await lines.getByRole('button', { name: 'Remove example line 1' }).tap();
        await expect(lines.getByRole('textbox')).toHaveCount(1);
        await expect(lines.getByRole('textbox')).toHaveValue('Mind the step.');
        const undoLine = lines.getByRole('button', { name: 'Undo' });
        await expect(undoLine).toBeFocused();
        await expect(lines).toContainText('Removed example line 1.');
        await expect(said(page, 'Removed example line 1.')).toHaveCount(1);
        await expect.poll(async () => (await stored(request, storyId)).characters[0].exampleLines).toEqual(['Mind the step.']);
        await undoLine.tap();
        await expect(lines.getByRole('textbox')).toHaveCount(2);
        await expect(lines.getByRole('button', { name: 'Remove example line 1' })).toBeFocused();
        await expect.poll(async () => (await stored(request, storyId)).characters[0].exampleLines).toEqual(['Boots off.', 'Mind the step.']);

        // A Bond gate: the same.
        await page.getByRole('tab', { name: /^Scenes/ }).tap();
        const scene = page.getByRole('region', { name: 'Scene 1' });
        await scene.getByRole('group', { name: 'Bond gate 1' }).getByRole('button', { name: 'Remove gate' }).tap();
        await expect(scene.getByRole('group', { name: 'Bond gate 1' })).toHaveCount(0);
        await expect.poll(async () => (await stored(request, storyId)).scenes[0].gates).toEqual([]);
        await scene.getByRole('button', { name: 'Undo' }).tap();
        await expect(scene.getByRole('group', { name: 'Bond gate 1' })).toHaveCount(1);
        await expect.poll(async () => (await stored(request, storyId)).scenes.find((s: { id: number }) => s.id === sceneId).gates).toHaveLength(1);

        // A Belief: the same.
        await page.getByRole('tab', { name: /^Bonds/ }).tap();
        const beliefs = page.getByRole('region', { name: 'Starting Beliefs' });
        await beliefs.getByRole('button', { name: 'Remove Starting Belief 1' }).tap();
        await expect(beliefs.getByRole('group', { name: 'Starting Belief 1' })).toHaveCount(0);
        await beliefs.getByRole('button', { name: 'Undo' }).tap();
        await expect(beliefs.getByRole('group', { name: 'Starting Belief 1' }).getByRole('textbox')).toHaveValue('Ash is a smuggler.');
        await expect.poll(async () => (await stored(request, storyId)).startingBeliefs).toHaveLength(1);

        // A Bond holds what was written about it, so it asks first; Cancel keeps it, focus back on Remove.
        const bonds = page.getByRole('region', { name: 'Starting Bonds from Mira' });
        const removeBond = bonds.getByRole('button', { name: 'Remove Bond toward Ash (the Role)' });
        await removeBond.tap();
        const question = bonds.getByRole('group', { name: 'Remove the Bond toward Ash (the Role)?' });
        await expect(question).toContainText('Its label, description and starting levels go too.');
        await expect(question.getByRole('button', { name: 'Cancel' })).toBeFocused();
        await question.getByRole('button', { name: 'Cancel' }).tap();
        await expect(removeBond).toBeFocused();
        expect((await stored(request, storyId)).startingBonds).toHaveLength(1);
        await removeBond.tap();
        await question.getByRole('button', { name: 'Remove', exact: true }).tap();
        await expect(bonds.getByRole('group', { name: /^Bond toward/ })).toHaveCount(0);
        await expect.poll(async () => (await stored(request, storyId)).startingBonds).toEqual([]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Add Document sheet closes while it fetches or adds, and keeps what it held', async ({ page, request }) => {
    await request.delete(FAKE);
    const { storyId } = await createStory(request);
    try {
        await page.goto(`/stories/${storyId}?tab=lore`);
        const section = page.getByRole('region', { name: 'Documents' });
        await section.getByRole('button', { name: '+ Add Document' }).tap();
        let sheet = page.getByRole('dialog', { name: 'Add Document' });

        // A page that never answers: Cancel still closes the sheet, and the address stays for next time.
        let releaseFetch!: () => void;
        const fetchHeld = new Promise<void>((resolve) => (releaseFetch = resolve));
        await page.route(`**/api/stories/${storyId}/documents/fetch-page`, async (route) => {
            await fetchHeld;
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ title: 'Late', text: 'Too late.', url: 'https://wiki.example/late' }) });
        });
        await sheet.getByRole('textbox', { name: 'Web page address' }).fill('https://wiki.example/late');
        await sheet.getByRole('button', { name: 'Fetch', exact: true }).tap();
        await expect(sheet.getByRole('button', { name: 'Fetching…' })).toBeDisabled();
        await sheet.getByRole('button', { name: 'Cancel' }).tap();
        await expect(sheet).toHaveCount(0);
        releaseFetch();
        await section.getByRole('button', { name: '+ Add Document' }).tap();
        sheet = page.getByRole('dialog', { name: 'Add Document' });
        await expect(sheet.getByRole('textbox', { name: 'Web page address' })).toHaveValue('https://wiki.example/late');
        // The page that came back after Cancel was let go.
        await expect(sheet.getByRole('textbox', { name: 'Title' })).toHaveValue('');

        // Closed with text in it, the text is kept (M18).
        await sheet.getByRole('textbox', { name: 'Text' }).fill('Tide tables for the harbour.');
        await page.keyboard.press('Escape');
        await expect(sheet).toHaveCount(0);
        await section.getByRole('button', { name: '+ Add Document' }).tap();
        sheet = page.getByRole('dialog', { name: 'Add Document' });
        await expect(sheet.getByRole('textbox', { name: 'Text' })).toHaveValue('Tide tables for the harbour.');

        // Closed while it adds: the Add goes on, the section says so, and the card lands.
        let releaseAdd!: () => void;
        const addHeld = new Promise<void>((resolve) => (releaseAdd = resolve));
        await page.route(`**/api/stories/${storyId}/documents`, async (route) => {
            await addHeld;
            await route.continue();
        });
        await sheet.getByRole('button', { name: 'Add', exact: true }).tap();
        await expect(sheet.getByRole('button', { name: 'Adding…' })).toBeDisabled();
        await sheet.getByRole('button', { name: 'Close' }).tap();
        await expect(sheet).toHaveCount(0);
        await expect(section.getByRole('status').filter({ hasText: 'Adding the Document… It appears here when it is done.' })).toBeVisible();
        releaseAdd();
        await expect(section.getByRole('region', { name: 'Document 1' })).toBeVisible();
        await expect(said(page, 'Added “Tide tables for the harbour.”.')).toHaveCount(1);
        // Added, the draft is cleared.
        await section.getByRole('button', { name: '+ Add Document' }).tap();
        await expect(page.getByRole('dialog', { name: 'Add Document' }).getByRole('textbox', { name: 'Text' })).toHaveValue('');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('async changes are said: a rewrite, the Story turning playable, new candidates, and a quiet Saved', async ({ page, request }) => {
    await request.delete(FAKE);
    // No Setting yet, so the Story is not playable.
    const { storyId } = await createStory(request, { setting: '' });
    try {
        await page.goto(`/stories/${storyId}`);
        const storySection = page.getByRole('region', { name: 'Story' });
        await expect(page.getByRole('tab', { name: 'Story, has missing fields (1)' })).toBeVisible();
        await expect(storySection.getByLabel('Setting')).toHaveAttribute('aria-required', 'true');

        // A rewrite lands: the field is lit, and it is said, as is the Story turning playable (H12).
        await request.post(`${FAKE}/text`, { data: { kind: 'field_rewrite', replies: ['A lighthouse at the end of a drowned causeway.'] } });
        const rewrite = storySection.getByTitle('Rewrite Setting');
        await rewrite.tap();
        await expect(storySection.getByLabel('Setting')).toHaveValue('A lighthouse at the end of a drowned causeway.');
        await expect(rewrite).toBeFocused();
        await expect(said(page, 'Rewrote Setting.')).toHaveCount(1);
        await expect(said(page, 'The Story is playable now.')).toHaveCount(1);

        // Saving is said once typing has rested, not at every step (M16).
        await storySection.getByLabel('Title').fill('The Lighthouse at Gull Point');
        const quiet = page.locator('span[aria-live="polite"]').filter({ hasText: 'Saved' });
        await expect(quiet).toHaveCount(1, { timeout: 10_000 });

        // A round of candidates is said, and focus lands on the first (H12).
        await request.post(`${FAKE}/image`, { data: { kind: 'reference_image', replies: [{}, {}, {}] } });
        await page.getByRole('tab', { name: 'Characters', exact: true }).tap();
        await page.getByRole('region', { name: 'Character 1' }).getByRole('button', { name: 'Generate Reference image' }).tap();
        await expect(page.getByRole('button', { name: 'Use candidate 1' })).toBeFocused();
        await expect(said(page, '3 candidates ready. Pick one.')).toHaveCount(1);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
        await request.delete(FAKE);
    }
});

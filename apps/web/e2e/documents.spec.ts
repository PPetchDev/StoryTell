import { APIRequestContext, expect, Page, test } from '@playwright/test';

// Documents (.scratch/documents/spec.md) in the Story editor's Lore tab, on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'Fog lies on the harbour.\n\n@Oren: The lamp is lit, keeper.';

async function createStory(request: APIRequestContext): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: 'The Harbour' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A foggy harbour town.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Petch', description: 'A new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Oren', appearance: 'Weathered.', personality: 'Gruff.', voice: 'Short words.' },
    });
    return storyId;
}

/** The Lore tab's Documents section. */
async function openDocuments(page: Page, storyId: number) {
    await page.goto(`/stories/${storyId}`);
    await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
    return page.getByRole('region', { name: 'Documents' });
}

const LIGHTHOUSE = Array.from(
    { length: 12 },
    (_, at) => `The lighthouse on Gull Point was built in year ${at + 1} of the harbour charter. Its keeper trims the wick at dusk and logs every passing ship in the tide ledger.`,
).join('\n\n');

test('a pasted Document is added with its passage count and survives a reload', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        const section = await openDocuments(page, storyId);
        await expect(section.getByText('Longer texts the Narrator looks things up in by meaning. Adding one costs less than a cent.')).toBeVisible();

        await section.getByRole('button', { name: '+ Add Document' }).tap();
        const sheet = page.getByRole('dialog', { name: 'Add Document' });
        await sheet.getByRole('textbox', { name: 'Title' }).fill('Gull Point light');
        await sheet.getByRole('textbox', { name: 'Text' }).fill(LIGHTHOUSE);
        await expect(sheet.getByText('About 2 passages · less than $0.01')).toBeVisible();

        // Held, so the sheet can be seen working.
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        await page.route(`**/api/stories/${storyId}/documents`, async (route) => {
            await held;
            await route.continue();
        });
        await sheet.getByRole('button', { name: 'Add', exact: true }).tap();
        await expect(sheet.getByRole('button', { name: 'Adding…' })).toBeDisabled();
        await expect(sheet.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        release();

        await expect(sheet).toHaveCount(0);
        const card = section.getByRole('region', { name: 'Document 1' });
        await expect(card.getByRole('textbox', { name: 'Title' })).toHaveValue('Gull Point light');
        const stored = (await (await request.get(`/api/stories/${storyId}`)).json()) as { documents: Array<{ passages: number; characters: number }> };
        expect(stored.documents).toHaveLength(1);
        const size = `Pasted · ${stored.documents[0].characters.toLocaleString('en-US')} characters · ${stored.documents[0].passages} passages`;
        await expect(card.getByText(size)).toBeVisible();

        // It spent one embedding call per batch, and only on Add.
        const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as {
            calls: Array<{ method: string; request?: { kind: string } }>;
        };
        expect(calls.filter((call) => call.method === 'embedTexts').map((call) => call.request?.kind)).toEqual(['document_embedding']);

        await page.reload();
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const reloaded = page.getByRole('region', { name: 'Document 1' });
        await expect(reloaded.getByRole('textbox', { name: 'Title' })).toHaveValue('Gull Point light');
        await expect(reloaded.getByText(size)).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a failed Add keeps the text in the sheet and shows why', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        await request.post('/api/testing/fake-gateway/embedding', {
            data: { kind: 'document_embedding', replies: [{ error: 'outage', message: 'DeepInfra is down.' }] },
        });
        const section = await openDocuments(page, storyId);
        await section.getByRole('button', { name: '+ Add Document' }).tap();
        const sheet = page.getByRole('dialog', { name: 'Add Document' });
        await sheet.getByRole('textbox', { name: 'Text' }).fill('Tide tables for the harbour.');
        await sheet.getByRole('button', { name: 'Add', exact: true }).tap();

        await expect(sheet.getByRole('alert')).toHaveText('DeepInfra is down.');
        await expect(sheet.getByRole('textbox', { name: 'Text' })).toHaveValue('Tide tables for the harbour.');
        await expect(sheet.getByRole('button', { name: 'Add', exact: true })).toBeEnabled();

        // Trying again just works.
        await sheet.getByRole('button', { name: 'Add', exact: true }).tap();
        await expect(sheet).toHaveCount(0);
        await expect(section.getByRole('region', { name: 'Document 1' }).getByRole('textbox', { name: 'Title' })).toHaveValue(
            'Tide tables for the harbour.',
        );
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a Document is renamed (kept after a reload), read, and removed with confirmation', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        await request.post(`/api/stories/${storyId}/documents`, {
            data: { title: 'Tide ledger', text: 'Ships logged at dusk.\n\nThe harbour wardens keep the ledger.', source: 'pasted' },
        });
        const section = await openDocuments(page, storyId);
        const card = section.getByRole('region', { name: 'Document 1' });

        await card.getByRole('textbox', { name: 'Title' }).fill('Harbour ledger');
        await expect(page.getByRole('status').filter({ hasText: /Saved|Saving|Unsaved/ })).toHaveText('Saved');
        await page.reload();
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        await expect(page.getByRole('region', { name: 'Document 1' }).getByRole('textbox', { name: 'Title' })).toHaveValue('Harbour ledger');

        await page.getByRole('region', { name: 'Document 1' }).getByRole('button', { name: 'Read' }).tap();
        const reading = page.getByRole('dialog', { name: 'Harbour ledger' });
        await expect(reading.getByText('Ships logged at dusk.')).toBeVisible();
        await expect(reading.getByText('The harbour wardens keep the ledger.')).toBeVisible();
        // Read-only: nothing to type into.
        await expect(reading.getByRole('textbox')).toHaveCount(0);
        await reading.getByRole('button', { name: 'Close' }).tap();
        await expect(reading).toHaveCount(0);

        const again = page.getByRole('region', { name: 'Document 1' });
        await again.getByRole('button', { name: 'Remove' }).tap();
        const confirm = again.getByRole('group', { name: 'Remove Harbour ledger?' });
        await expect(confirm.getByText('Adding it again costs a call.', { exact: false })).toBeVisible();
        await confirm.getByRole('button', { name: 'Cancel' }).tap();
        await expect(page.getByRole('region', { name: 'Document 1' })).toBeVisible();

        await page.getByRole('region', { name: 'Document 1' }).getByRole('button', { name: 'Remove' }).tap();
        await page.getByRole('group', { name: 'Remove Harbour ledger?' }).getByRole('button', { name: 'Remove' }).tap();
        await expect(page.getByRole('region', { name: 'Document 1' })).toHaveCount(0);
        const stored = (await (await request.get(`/api/stories/${storyId}`)).json()) as { documents: unknown[] };
        expect(stored.documents).toEqual([]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';
const LIGHT = 'The Gull Point lighthouse keeper trims the brass wick at dusk.';
const QUESTION = 'I ask Oren how the Gull Point lighthouse keeper trims the brass wick at dusk.';

async function scriptTurn(request: APIRequestContext) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: '@Oren: Every dusk.', model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

/** Opens the Memory drawer from the Chat menu. */
async function openMemory(page: Page) {
    await page.getByRole('button', { name: 'Chat menu' }).click();
    await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
    return page.getByRole('complementary', { name: 'Memory' });
}

test('the Memory drawer lists the passages the last turn used, and says when its search failed', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        await request.post(`/api/stories/${storyId}/documents`, { data: { title: 'Gull Point light', text: LIGHT, source: 'pasted' } });
        await request.post(`/api/stories/${storyId}/documents`, { data: { title: 'Valley bakers', text: 'Bakers in the valley sell rye bread at dawn.', source: 'pasted' } });
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        let drawer = await openMemory(page);
        let card = drawer.getByRole('region', { name: 'Documents in play' });
        await expect(card.getByText('No turn has looked in the Documents yet.')).toBeVisible();
        // Under Lore in play.
        const lore = await drawer.getByRole('region', { name: 'Lore in play' }).boundingBox();
        expect((await card.boundingBox())!.y).toBeGreaterThan(lore!.y);
        await drawer.getByRole('button', { name: 'Close' }).first().click();

        await scriptTurn(request);
        await page.getByLabel('Write as Petch').fill(QUESTION);
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText('Every dusk.')).toBeVisible();

        drawer = await openMemory(page);
        card = drawer.getByRole('region', { name: 'Documents in play' });
        await expect(card.getByRole('list', { name: 'Document passages in play' }).getByRole('listitem')).toHaveText([`Gull Point light · ${LIGHT}`]);
        await drawer.getByRole('button', { name: 'Close' }).first().click();

        // The next turn's search fails at the embedding host: the turn still plays.
        await request.post('/api/testing/fake-gateway/embedding', { data: { kind: 'document_search', replies: [{ error: 'outage' }] } });
        await scriptTurn(request);
        await page.getByLabel('Write as Petch').fill('And the ledger?');
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText('Every dusk.')).toHaveCount(2);

        drawer = await openMemory(page);
        await expect(drawer.getByRole('region', { name: 'Documents in play' }).getByText("The last turn's search failed, so it used no Documents.")).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Memory drawer has no Documents in play card for a Story without Documents', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const drawer = await openMemory(page);
        await expect(drawer.getByRole('region', { name: 'Lore in play' })).toBeVisible();
        await expect(drawer.getByRole('region', { name: 'Documents in play' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the Memory drawer says when no passage was close enough to the last turn', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        await request.post(`/api/stories/${storyId}/documents`, { data: { title: 'Valley bakers', text: 'Bakers in the valley sell rye bread at dawn.', source: 'pasted' } });
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
        await scriptTurn(request);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await page.getByLabel('Write as Petch').fill(QUESTION);
        await page.getByRole('button', { name: 'Send' }).click();
        await expect(page.getByText('Every dusk.')).toBeVisible();

        const drawer = await openMemory(page);
        await expect(drawer.getByRole('region', { name: 'Documents in play' }).getByText('None close enough to the last turn.')).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

/** Picks a file through the sheet's "Load a .txt or .md file" button. */
async function pickFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('dialog', { name: 'Add Document' }).getByRole('button', { name: 'Load a .txt or .md file' }).tap();
    await (await chooser).setFiles(file);
}

test('a .txt file loads into the sheet, adds as a file Document, and its card shows the file name after a reload', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        const section = await openDocuments(page, storyId);
        await section.getByRole('button', { name: '+ Add Document' }).tap();
        const sheet = page.getByRole('dialog', { name: 'Add Document' });

        await pickFile(page, { name: 'harbour-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Tide tables for the harbour.\n\nกระแสน้ำขึ้นตอนเที่ยง') });
        await expect(sheet.getByRole('textbox', { name: 'Title' })).toHaveValue('harbour-notes');
        await expect(sheet.getByRole('textbox', { name: 'Text' })).toHaveValue('Tide tables for the harbour.\n\nกระแสน้ำขึ้นตอนเที่ยง');
        // Loading spends nothing; only Add does.
        let calls = (await (await request.get('/api/testing/fake-gateway/calls')).json()).calls as Array<{ method: string }>;
        expect(calls.filter((call) => call.method === 'embedTexts')).toEqual([]);

        await sheet.getByRole('button', { name: 'Add', exact: true }).tap();
        await expect(sheet).toHaveCount(0);
        calls = (await (await request.get('/api/testing/fake-gateway/calls')).json()).calls;
        expect(calls.filter((call) => call.method === 'embedTexts')).toHaveLength(1);

        await page.reload();
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const card = page.getByRole('region', { name: 'Document 1' });
        await expect(card.getByRole('textbox', { name: 'Title' })).toHaveValue('harbour-notes');
        await expect(card.getByText(/^harbour-notes\.txt · \d+ characters · 1 passage$/)).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('the file picker refuses another type, a file over 1 MB and text that is not UTF-8, filling nothing', async ({ page, request }) => {
    const storyId = await createStory(request);
    try {
        const section = await openDocuments(page, storyId);
        await section.getByRole('button', { name: '+ Add Document' }).tap();
        const sheet = page.getByRole('dialog', { name: 'Add Document' });
        const title = sheet.getByRole('textbox', { name: 'Title' });
        const text = sheet.getByRole('textbox', { name: 'Text' });

        await pickFile(page, { name: 'chapter.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7') });
        await expect(sheet.getByRole('alert')).toHaveText('Only a .txt or .md file can be loaded.');

        await pickFile(page, { name: 'huge.md', mimeType: 'text/markdown', buffer: Buffer.alloc(1024 * 1024 + 1, 'a') });
        await expect(sheet.getByRole('alert')).toHaveText('That file is over 1 MB. Split it, or paste part of it.');

        // windows-874 Thai bytes are not UTF-8.
        await pickFile(page, { name: 'thai.txt', mimeType: 'text/plain', buffer: Buffer.from([0xa1, 0xc3, 0xd8, 0xa7, 0xe0, 0xb7, 0xbe]) });
        await expect(sheet.getByRole('alert')).toHaveText("Couldn't read this file as text");

        await expect(title).toHaveValue('');
        await expect(text).toHaveValue('');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a web page scripted through the testing controls is fetched into the sheet, added, and its card links to the address', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    const url = 'https://wiki.example/Gull_Point';
    try {
        await request.post('/api/testing/fake-gateway/page', {
            data: {
                url,
                body: '<html><head><title>Gull Point - Harbour Wiki</title></head><body><nav>Home · Random</nav><article><h1>Gull Point</h1><p>A cape with a light &amp; a keeper.</p></article><footer>© Wiki</footer></body></html>',
            },
        });
        const section = await openDocuments(page, storyId);
        await section.getByRole('button', { name: '+ Add Document' }).tap();
        const sheet = page.getByRole('dialog', { name: 'Add Document' });

        await sheet.getByRole('textbox', { name: 'Web page address' }).fill(url);
        await sheet.getByRole('button', { name: 'Fetch', exact: true }).tap();
        await expect(sheet.getByRole('textbox', { name: 'Title' })).toHaveValue('Gull Point');
        await expect(sheet.getByRole('textbox', { name: 'Text' })).toHaveValue('# Gull Point\n\nA cape with a light & a keeper.');
        // Fetching spends nothing.
        let calls = (await (await request.get('/api/testing/fake-gateway/calls')).json()).calls as Array<{ method: string }>;
        expect(calls.filter((call) => call.method === 'embedTexts')).toEqual([]);

        await sheet.getByRole('button', { name: 'Add', exact: true }).tap();
        await expect(sheet).toHaveCount(0);
        calls = (await (await request.get('/api/testing/fake-gateway/calls')).json()).calls;
        expect(calls.filter((call) => call.method === 'embedTexts')).toHaveLength(1);

        await page.reload();
        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const card = page.getByRole('region', { name: 'Document 1' });
        await expect(card.getByRole('textbox', { name: 'Title' })).toHaveValue('Gull Point');
        await expect(card.getByRole('link', { name: url })).toHaveAttribute('href', url);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a page that cannot be fetched is explained in the sheet, with the advice to paste the text', async ({ page, request }) => {
    await request.delete('/api/testing/fake-gateway');
    const storyId = await createStory(request);
    try {
        await request.post('/api/testing/fake-gateway/page', { data: { url: 'https://wiki.example/gone', status: 404, body: 'Not here' } });
        const section = await openDocuments(page, storyId);
        await section.getByRole('button', { name: '+ Add Document' }).tap();
        const sheet = page.getByRole('dialog', { name: 'Add Document' });

        // Held, so the sheet can be seen working.
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        await page.route(`**/api/stories/${storyId}/documents/fetch-page`, async (route) => {
            await held;
            await route.continue();
        });
        await sheet.getByRole('textbox', { name: 'Web page address' }).fill('https://wiki.example/gone');
        await sheet.getByRole('button', { name: 'Fetch', exact: true }).tap();
        await expect(sheet.getByRole('button', { name: 'Fetching…' })).toBeDisabled();
        release();
        await expect(sheet.getByRole('alert')).toHaveText("The page answered 404. Paste the page's text instead.");

        await sheet.getByRole('textbox', { name: 'Web page address' }).fill('http://localhost:4001/api/stories');
        await sheet.getByRole('button', { name: 'Fetch', exact: true }).tap();
        await expect(sheet.getByRole('alert')).toHaveText("That address names this PC itself. Paste the page's text instead.");
        await expect(sheet.getByRole('textbox', { name: 'Text' })).toHaveValue('');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

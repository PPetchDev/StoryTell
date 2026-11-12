import { readFile } from 'node:fs/promises';

import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { cardFixture, cardFixtureJson, chunkTypes, jsonFile, pngCard, pngImage, v2Card } from '../../api/test/harness/card-files';

// Character cards (CONTEXT.md: "Character card") on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** The fake gateway's control routes, reached through the Next.js /api proxy. */
const FAKE = '/api/testing/fake-gateway';

// Before as well as after: an earlier file's background calls may still be in the log, and
// these tests check that a card spends nothing.
test.beforeEach(async ({ request }) => {
    await request.delete(FAKE);
});

test.afterEach(async ({ request }) => {
    await request.delete(FAKE);
});

/** Opens Home's New Story panel and picks a card file through "From a Character card". */
async function pickCard(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Story' }).tap();
    const panel = page.getByRole('region', { name: 'New Story' });
    const chooser = page.waitForEvent('filechooser');
    await panel.getByRole('button', { name: 'From a Character card' }).tap();
    await (await chooser).setFiles(file);
    return panel;
}

function storyIdOf(page: Page): number {
    return Number(/\/stories\/(\d+)/.exec(page.url())![1]);
}

/** Calls that spend credit: text and image calls (the credit balance check is free). */
async function spendingCalls(request: APIRequestContext): Promise<unknown[]> {
    const { calls } = (await (await request.get(`${FAKE}/calls`)).json()) as { calls: Array<{ method: string }> };
    return calls.filter((call) => call.method !== 'remainingCredit');
}

test('a JSON card on Home makes a new Story, with the notice and an unsent tidy message', async ({ page, request }) => {
    const panel = await pickCard(page, { name: 'mira.json', mimeType: 'application/json', buffer: cardFixture('v2-lighthouse.json') });
    await expect(panel.getByRole('heading', { name: 'Mira' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Import' })).toBeDisabled();
    await panel.getByLabel('Your name in this Story').fill('Ash');
    await panel.getByRole('button', { name: 'Import' }).tap();

    // The editor opens on the new Story; the one-time flag has already left the URL.
    await expect(page).toHaveURL(/\/stories\/\d+$/);
    const storyId = storyIdOf(page);
    try {
        const notice = page.getByRole('region', { name: 'Made from a Character card' });
        await expect(notice).toContainText("Fill in what's marked, or ask the Story assistant to tidy it.");
        const story = page.getByRole('region', { name: 'Story' });
        await expect(story.getByLabel('Title')).toHaveValue('Mira');
        await expect(story.getByLabel('Setting')).toHaveValue('Ash arrives on the supply boat as the new assistant keeper.');
        await expect(story.getByLabel('Opening')).toHaveValue('Rain hammers the gallery windows. "You\'re Ash? You\'re late."');
        // Appearance, Voice and the Role's description are still to fill in.
        const status = page.getByRole('region', { name: 'Playable status' });
        // The list starts folded to its count (audit M47).
        await status.getByRole('button', { name: /to fill in/ }).click();
        await expect(status).toContainText('Mira: Appearance');
        await expect(status).toContainText('Mira: Voice');
        await expect(status).toContainText('Role: Description');

        await page.getByRole('tab', { name: 'Lore', exact: true }).tap();
        const lore = page.getByRole('region', { name: 'Lore' });
        await expect(lore.getByRole('region', { name: 'Lore 1' }).getByRole('heading', { name: 'Lamp room' })).toBeVisible();
        await expect(lore.getByRole('region', { name: 'Lore 2' }).getByRole('heading', { name: 'Gull Rock' })).toBeVisible();
        await expect(lore.getByRole('region', { name: 'Lore 3' }).getByRole('heading', { name: 'Storms' })).toBeVisible();
        await expect(lore.getByRole('region', { name: 'Lore 4' })).toHaveCount(0);

        // Tidy fills the assistant's message and sends nothing.
        await notice.getByRole('button', { name: 'Tidy with the Story assistant' }).tap();
        const sheet = page.getByRole('dialog', { name: 'Assistant' });
        await expect(sheet.getByLabel('Instruction')).toHaveValue(
            "Split Mira's Background into Appearance, Personality, Voice and Background, keeping every detail, and write a short description of my Role.",
        );
        await expect(sheet.getByRole('list', { name: 'Conversation' }).getByRole('listitem')).toHaveCount(0);
        expect(await spendingCalls(request)).toEqual([]);

        // One time only: a reload shows no notice.
        await page.reload();
        // The editor comes back on the Lore tab, kept in the URL.
        await expect(page.getByRole('region', { name: 'Lore' }).getByRole('region', { name: 'Lore 1' })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Made from a Character card' })).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a file that is not a card is refused in the panel, with "Choose another file"', async ({ page, request }) => {
    const before = ((await (await request.get('/api/stories')).json()) as { stories: unknown[] }).stories.length;
    const panel = await pickCard(page, { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"title": "Notes"}') });
    // Refused as soon as it is read: no name is asked for.
    const refused = panel.getByRole('alert');
    await expect(refused).toContainText('This card could not be read.');
    await expect(panel.getByLabel('Your name in this Story')).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/);

    // Choose another file opens the picker again; a good card then imports.
    const chooser = page.waitForEvent('filechooser');
    await refused.getByRole('button', { name: 'Choose another file' }).tap();
    await (await chooser).setFiles({ name: 'vela.json', mimeType: 'application/json', buffer: cardFixture('v1-flat.json') });
    await expect(panel.getByRole('heading', { name: 'Captain Vela' })).toBeVisible();
    await panel.getByLabel('Your name in this Story').fill('Jun');
    await panel.getByRole('button', { name: 'Import' }).tap();
    await expect(page).toHaveURL(/\/stories\/\d+$/);
    const storyId = storyIdOf(page);
    try {
        await expect(page.getByRole('region', { name: 'Story' }).getByLabel('Opening')).toHaveValue("*Vela looks Jun up and down.* You're late, Jun.");
        const after = ((await (await request.get('/api/stories')).json()) as { stories: unknown[] }).stories.length;
        expect(after).toBe(before + 1);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a PNG card shows its picture in the panel, and becomes the Portrait and the Cover', async ({ page, request }) => {
    const panel = await pickCard(page, { name: 'lighthouse.png', mimeType: 'image/png', buffer: cardFixture('lighthouse-card.png') });
    const picture = panel.getByRole('img', { name: 'Picture of Mira' });
    await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(64);
    await panel.getByLabel('Your name in this Story').fill('Ash');
    await panel.getByRole('button', { name: 'Import' }).tap();
    await expect(page).toHaveURL(/\/stories\/\d+$/);
    const storyId = storyIdOf(page);
    try {
        const stored = (await (await request.get(`/api/stories/${storyId}`)).json()) as { characters: Array<{ referenceImagePath: string }> };
        const imagePath = stored.characters[0].referenceImagePath;
        expect(imagePath).toMatch(/\.png$/);
        // The Cover banner shows the Reference image at once.
        await expect(page.getByRole('button', { name: 'Change the Cover' })).toHaveAttribute('style', new RegExp(imagePath));
        await page.getByRole('tab', { name: 'Characters' }).tap();
        const image = page.getByRole('region', { name: 'Character 1' }).getByRole('img', { name: 'Reference image of Mira' });
        await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(64);

        await page.goto('/');
        const card = page.getByRole('list', { name: 'Stories' }).getByRole('button', { name: /Mira/ });
        await expect(card.locator('img')).toHaveAttribute('src', new RegExp(imagePath));
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('a plain PNG photo is refused in the panel, with "Choose another file"', async ({ page }) => {
    const panel = await pickCard(page, { name: 'IMG_0001.png', mimeType: 'image/png', buffer: pngImage(20, 20) });
    const refused = panel.getByRole('alert');
    await expect(refused).toContainText('This picture has no Character card in it.');
    await expect(refused.getByRole('button', { name: 'Choose another file' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
});

test('a PNG card of about 14 MB imports through the web; a 16 MB one shows the size error', async ({ page, request }) => {
    const card = cardFixtureJson('v2-lighthouse.json');
    /** A card made big by a text chunk, which the stored picture drops. */
    const sized = (megabytes: number) =>
        pngCard({ chara: card, extraText: [{ keyword: 'Comment', text: 'a'.repeat(Math.round(megabytes * 1024 * 1024)) }] });

    const big = sized(14);
    expect(big.length).toBeGreaterThan(14 * 1024 * 1024);
    expect(big.length).toBeLessThan(15 * 1024 * 1024);
    const panel = await pickCard(page, { name: 'big.png', mimeType: 'image/png', buffer: big });
    await panel.getByLabel('Your name in this Story').fill('Ash');
    await panel.getByRole('button', { name: 'Import' }).tap();
    await expect(page).toHaveURL(/\/stories\/\d+$/, { timeout: 30_000 });
    const storyId = storyIdOf(page);
    try {
        await expect(page.getByRole('region', { name: 'Story' }).getByLabel('Title')).toHaveValue('Mira');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }

    const tooBig = await pickCard(page, { name: 'too-big.png', mimeType: 'image/png', buffer: sized(16) });
    // The API's own typed error, not a proxy failure (which would show the can't-connect screen).
    await expect(tooBig.getByRole('alert')).toContainText('That card is too large: at most 15 MB.', { timeout: 30_000 });
});

test('the preview shows the card and what stays behind, and the chosen greeting becomes the Opening', async ({ page, request }) => {
    const panel = await pickCard(page, { name: 'lighthouse.png', mimeType: 'image/png', buffer: cardFixture('lighthouse-card.png') });
    await expect(panel.getByRole('heading', { name: 'Mira' })).toBeVisible();
    await expect(panel).toContainText('By tester');
    await expect(panel).toContainText('3 Lore entries');

    // The creator's notes and the left-out list are folded until opened.
    await expect(panel.getByText('Works best with slow-burn openings.')).toBeHidden();
    await panel.getByText("Creator's notes", { exact: true }).tap();
    await expect(panel.getByText('Works best with slow-burn openings.')).toBeVisible();
    const leftOut = panel.getByRole('list', { name: "Won't come along" });
    await expect(leftOut).toBeHidden();
    await panel.getByText("Won't come along", { exact: true }).tap();
    await expect(leftOut).toContainText("The card's system prompt (Storytell writes its own).");

    // Three greetings, macros as written, the first chosen.
    const opening = panel.getByRole('group', { name: 'Opening' });
    await expect(opening.getByRole('radio')).toHaveCount(3);
    await expect(opening.getByRole('radio', { name: /First message/ })).toBeChecked();
    await expect(opening).toContainText('{{char}} is mending nets on the jetty when {{user}} steps off the boat.');
    await opening.getByRole('radio', { name: /Alternate greeting 2/ }).check();

    await panel.getByLabel('Your name in this Story').fill('Ash');
    await panel.getByRole('button', { name: 'Import' }).tap();
    await expect(page).toHaveURL(/\/stories\/\d+$/);
    const storyId = storyIdOf(page);
    try {
        await expect(page.getByRole('region', { name: 'Story' }).getByLabel('Opening')).toHaveValue('Mira is mending nets on the jetty when Ash steps off the boat.');
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test("a Storytell card's own Role name fills the name field", async ({ page }) => {
    const card = v2Card({ name: 'Mira', extensions: { storytell: { version: 1, character: {}, role: { name: 'Ash', description: '' }, style: {} } } });
    const panel = await pickCard(page, { name: 'mira.json', mimeType: 'application/json', buffer: jsonFile(card) });
    await expect(panel.getByLabel('Your name in this Story')).toHaveValue('Ash');
});

test.describe('Export as Character card (desktop: the file downloads)', () => {
    test.use({ viewport: { width: 1280, height: 800 }, hasTouch: false, isMobile: false });

    /** Imports a card through the API and answers the new Story's id and its Character's name. */
    async function imported(request: APIRequestContext, card: Buffer, name: string): Promise<number> {
        const response = await request.post('/api/stories/from-card', {
            multipart: { card: { name, mimeType: name.endsWith('.png') ? 'image/png' : 'application/json', buffer: card }, roleName: 'Ash' },
        });
        expect(response.status()).toBe(201);
        return ((await response.json()) as { id: number }).id;
    }

    /** Taps Export on the first Character's card and answers the downloaded file. */
    async function exportFirstCharacter(page: Page, storyId: number): Promise<{ name: string; bytes: Buffer }> {
        await page.goto(`/stories/${storyId}?tab=characters`);
        const character = page.getByRole('region', { name: 'Character 1' });
        const downloading = page.waitForEvent('download');
        await character.getByRole('button', { name: 'Export as Character card' }).click();
        const download = await downloading;
        await expect(character.getByRole('button', { name: 'Export as Character card' })).toBeEnabled();
        return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) };
    }

    test('a Character with a Reference image downloads <name>.png, which imports back as the same Character', async ({ page, request }) => {
        const storyId = await imported(request, cardFixture('lighthouse-card.png'), 'lighthouse.png');
        const ids = [storyId];
        try {
            // Give Mira the fields a card from elsewhere leaves blank, so the round trip carries them.
            await request.patch(`/api/stories/${storyId}/characters/${await firstCharacterId(request, storyId)}`, {
                data: { appearance: 'Tall, grey-green eyes.', voice: 'Short sentences.', secrets: 'She put the lamp out.' },
            });
            await request.patch(`/api/stories/${storyId}/role`, { data: { description: 'The new keeper.' } });
            const original = await story(request, storyId);

            const file = await exportFirstCharacter(page, storyId);
            expect(file.name).toBe('Mira.png');
            expect(chunkTypes(file.bytes)).toEqual(expect.arrayContaining(['IHDR', 'IDAT', 'tEXt', 'IEND']));
            // The picture is the Reference image at its own size (the fixture is 64×96).
            expect([file.bytes.readUInt32BE(16), file.bytes.readUInt32BE(20)]).toEqual([64, 96]);

            const backId = await imported(request, file.bytes, file.name);
            ids.push(backId);
            const back = await story(request, backId);
            const fields = (s: StoryBody) => {
                const { id: _id, referenceImagePath: _path, portraitCrop: _crop, ...character } = s.characters[0];
                return { character, role: { name: s.role.name, description: s.role.description }, style: s.style, setting: s.setting, opening: s.opening, lore: s.lore.map(({ id: _l, ...entry }) => entry) };
            };
            expect(fields(back)).toEqual(fields(original));
            expect(back.characters[0].referenceImagePath).toMatch(/\.png$/);
        } finally {
            for (const id of ids) await request.delete(`/api/stories/${id}`);
        }
    });

    test('a Character without a Reference image exports over their initial', async ({ page, request }) => {
        const storyId = await imported(request, cardFixture('v1-flat.json'), 'vela.json');
        const ids = [storyId];
        try {
            const file = await exportFirstCharacter(page, storyId);
            expect(file.name).toBe('Captain Vela.png');
            expect([file.bytes.readUInt32BE(16), file.bytes.readUInt32BE(20)]).toEqual([512, 768]);
            const backId = await imported(request, file.bytes, file.name);
            ids.push(backId);
            const back = await story(request, backId);
            expect(back.characters[0].name).toBe('Captain Vela');
            expect(back.opening).toBe("*Vela looks Ash up and down.* You're late, Ash.");
        } finally {
            for (const id of ids) await request.delete(`/api/stories/${id}`);
        }
    });
});

interface StoryBody {
    setting: string;
    opening: string;
    style: unknown;
    role: { name: string; description: string };
    characters: Array<{ id: number; name: string; referenceImagePath: string | null; portraitCrop: unknown } & Record<string, unknown>>;
    lore: Array<{ id: number } & Record<string, unknown>>;
}

async function story(request: APIRequestContext, storyId: number): Promise<StoryBody> {
    return (await (await request.get(`/api/stories/${storyId}`)).json()) as StoryBody;
}

async function firstCharacterId(request: APIRequestContext, storyId: number): Promise<number> {
    return (await story(request, storyId)).characters[0].id;
}

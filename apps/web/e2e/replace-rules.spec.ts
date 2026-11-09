import { readFileSync } from 'node:fs';
import { readFile as readFileAsync } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Replace rules (.scratch/saved-replies-and-replace-rules/spec.md), on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'Dust rises over the market.\n\n@Nara: Welcome, traveller.';

interface RuleLogic {
    find: string;
    replace: string;
    regex: boolean;
    ignoreCase: boolean;
}

interface StoredRule extends RuleLogic {
    id: number;
    onAi: boolean;
    onMine: boolean;
}

interface ReplaceCase {
    name: string;
    rules: RuleLogic[];
    text: string;
    repeat?: number;
    expected?: string;
    unchanged?: true;
    expectedRepeat?: { text: string; repeat: number };
}

/** The one table the API's copy of the apply function answers to (apps/api/test/replace-rules.spec.ts). */
const CASES_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../api/test/fixtures/replace-rule-cases.json');
const { cases } = JSON.parse(readFileSync(CASES_FILE, 'utf8')) as { cases: ReplaceCase[] };

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

async function appWide(request: APIRequestContext): Promise<StoredRule[]> {
    return ((await (await request.get('/api/replace-rules')).json()) as { replaceRules: StoredRule[] }).replaceRules;
}

/** Leaves the shared e2e database without app-wide Replace rules. */
async function clearAppWide(request: APIRequestContext) {
    for (const rule of await appWide(request)) await request.delete(`/api/replace-rules/${rule.id}`);
}

async function saved(page: Page) {
    await expect(page.getByRole('status').filter({ hasText: /^(Saved|Saving…|Unsaved changes|Couldn't save)$/ })).toHaveText('Saved');
}

function rule(list: Locator, number: number) {
    const card = list.getByRole('region', { name: `Replace rule ${number}`, exact: true });
    return {
        card,
        find: card.getByRole('textbox', { name: 'Find' }),
        replace: card.getByRole('textbox', { name: 'Replace' }),
        check: (label: string) => card.getByRole('checkbox', { name: label }),
        sample: card.getByRole('textbox', { name: 'Try it' }),
        result: card.getByRole('status', { name: 'Try it result' }),
    };
}

/** Sets a switch to `on`, tapping it only when it differs. */
async function setSwitch(box: Locator, on: boolean) {
    if ((await box.isChecked()) !== on) await box.tap();
    await expect(box).toBeChecked({ checked: on });
}

const logic = (stored: StoredRule[]) => stored.map(({ id: _id, ...fields }) => fields);

test.describe('Replace rules', () => {
    test.beforeEach(async ({ request }) => clearAppWide(request));
    test.afterEach(async ({ request }) => clearAppWide(request));

    test("Settings' card adds, edits, switches, reorders and removes app-wide rules, each surviving a reload", async ({ page, request }) => {
        await page.goto('/settings');
        const list = page.getByRole('region', { name: 'Replace rules', exact: true });
        await list.getByRole('button', { name: '+ Add replace rule' }).tap();
        const first = rule(list, 1);
        await expect(first.find).toBeFocused();
        // Spaces are part of Find.
        await first.find.fill(' smirked');
        await first.replace.fill(' smiled');
        await saved(page);
        expect(logic(await appWide(request))).toEqual([
            { find: ' smirked', replace: ' smiled', regex: false, ignoreCase: false, onAi: true, onMine: false },
        ]);

        await page.reload();
        let reloaded = rule(page.getByRole('region', { name: 'Replace rules', exact: true }), 1);
        await expect(reloaded.find).toHaveValue(' smirked');
        await expect(reloaded.replace).toHaveValue(' smiled');
        await reloaded.find.fill('(\\w+) smirked');
        await reloaded.replace.fill('$1 smiled');
        await setSwitch(reloaded.check('Regex'), true);
        await setSwitch(reloaded.check('Ignore case'), true);
        await setSwitch(reloaded.check('On AI Messages'), false);
        await setSwitch(reloaded.check('On my Messages'), true);
        await saved(page);
        expect(logic(await appWide(request))).toEqual([
            { find: '(\\w+) smirked', replace: '$1 smiled', regex: true, ignoreCase: true, onAi: false, onMine: true },
        ]);

        // A second rule, then the order changes both ways.
        const listNow = page.getByRole('region', { name: 'Replace rules', exact: true });
        await listNow.getByRole('button', { name: '+ Add replace rule' }).tap();
        await rule(listNow, 2).find.fill('grin');
        await saved(page);
        await listNow.getByRole('button', { name: 'Move rule 2 up' }).tap();
        await saved(page);
        expect((await appWide(request)).map((stored) => stored.find)).toEqual(['grin', '(\\w+) smirked']);
        await page.reload();
        reloaded = rule(page.getByRole('region', { name: 'Replace rules', exact: true }), 1);
        await expect(reloaded.find).toHaveValue('grin');
        await page.getByRole('region', { name: 'Replace rules', exact: true }).getByRole('button', { name: 'Move rule 1 down' }).tap();
        await saved(page);
        expect((await appWide(request)).map((stored) => stored.find)).toEqual(['(\\w+) smirked', 'grin']);

        await page.reload();
        const after = page.getByRole('region', { name: 'Replace rules', exact: true });
        await expect(rule(after, 1).find).toHaveValue('(\\w+) smirked');
        await expect(rule(after, 1).check('On my Messages')).toBeChecked();
        await rule(after, 1).card.getByRole('button', { name: 'Remove' }).tap();
        await saved(page);
        await page.reload();
        const last = page.getByRole('region', { name: 'Replace rules', exact: true });
        await expect(rule(last, 1).find).toHaveValue('grin');
        await expect(rule(last, 2).card).toHaveCount(0);
        expect((await appWide(request)).map((stored) => stored.find)).toEqual(['grin']);
    });

    test("the Style tab's folding card manages the Story's own rules, each change surviving a reload", async ({ page, request }) => {
        const storyId = await createStory(request);
        const storyRules = async () => ((await (await request.get(`/api/stories/${storyId}`)).json()) as { replaceRules: StoredRule[] }).replaceRules;
        try {
            await page.goto(`/stories/${storyId}?tab=style`);
            await expect(page.getByRole('tablist', { name: 'Story sections' }).getByRole('tab')).toHaveCount(7);
            const list = page.getByRole('region', { name: 'Replace rules', exact: true });
            await list.getByRole('button', { name: '+ Add replace rule' }).tap();
            await rule(list, 1).find.fill('colour');
            await rule(list, 1).replace.fill('color');
            await setSwitch(rule(list, 1).check('On my Messages'), true);
            await list.getByRole('button', { name: '+ Add replace rule' }).tap();
            await rule(list, 2).find.fill('Nara');
            await setSwitch(rule(list, 2).check('Ignore case'), true);
            await saved(page);
            expect(logic(await storyRules())).toEqual([
                { find: 'colour', replace: 'color', regex: false, ignoreCase: false, onAi: true, onMine: true },
                { find: 'Nara', replace: '', regex: false, ignoreCase: true, onAi: true, onMine: false },
            ]);

            await page.reload();
            const reloaded = page.getByRole('region', { name: 'Replace rules', exact: true });
            await expect(rule(reloaded, 2).find).toHaveValue('Nara');
            await rule(reloaded, 2).replace.fill('the trader');
            await setSwitch(rule(reloaded, 1).check('On AI Messages'), false);
            await saved(page);
            await reloaded.getByRole('button', { name: 'Move rule 2 up' }).tap();
            await saved(page);
            expect(logic(await storyRules())).toEqual([
                { find: 'Nara', replace: 'the trader', regex: false, ignoreCase: true, onAi: true, onMine: false },
                { find: 'colour', replace: 'color', regex: false, ignoreCase: false, onAi: false, onMine: true },
            ]);

            await page.reload();
            const after = page.getByRole('region', { name: 'Replace rules', exact: true });
            await expect(rule(after, 1).replace).toHaveValue('the trader');
            await expect(rule(after, 2).check('On AI Messages')).not.toBeChecked();
            await rule(after, 1).card.getByRole('button', { name: 'Remove' }).tap();
            await saved(page);
            await page.reload();
            await expect(rule(page.getByRole('region', { name: 'Replace rules', exact: true }), 1).find).toHaveValue('colour');
            expect((await storyRules()).map((stored) => stored.find)).toEqual(['colour']);
            expect(await appWide(request)).toEqual([]);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test("a bad regex shows the web's compile error at once; a refused save shows the API's reason with the typed text kept", async ({ page, request }) => {
        await request.post('/api/replace-rules', { data: { find: 'grin', replace: 'smile' } });
        await page.goto('/settings');
        const card = rule(page.getByRole('region', { name: 'Replace rules', exact: true }), 1);

        await setSwitch(card.check('Regex'), true);
        await saved(page);
        await card.find.fill('(grin');
        // At once: no save is waited for.
        await expect(card.card.getByRole('alert')).toContainText('Invalid regular expression', { timeout: 1_000 });
        await expect(card.card.getByRole('alert')).toContainText('Unterminated group');
        await saved(page);
        expect((await appWide(request))[0]).toMatchObject({ find: 'grin', regex: true });

        // An empty-matching pattern compiles, so only the API can refuse it.
        await card.find.fill('x*');
        await expect(card.card.getByRole('alert')).toHaveText('This would match between every letter');
        await expect(card.find).toHaveValue('x*');
        expect((await appWide(request))[0]).toMatchObject({ find: 'grin', replace: 'smile', regex: true });

        // A good pattern saves again and clears the reason.
        await card.find.fill('gr(i)n');
        await saved(page);
        await expect(card.card.getByRole('alert')).toHaveCount(0);
        expect((await appWide(request))[0]).toMatchObject({ find: 'gr(i)n', regex: true });
    });

    test('"Try it" gives what the table of cases expects, for every single-rule case', async ({ page }) => {
        test.setTimeout(120_000);
        await page.goto('/settings');
        const list = page.getByRole('region', { name: 'Replace rules', exact: true });
        await list.getByRole('button', { name: '+ Add replace rule' }).tap();
        const card = rule(list, 1);
        const single = cases.filter((entry) => entry.rules.length === 1);
        expect(single.length).toBeGreaterThanOrEqual(8);
        for (const entry of single) {
            const [logicOf] = entry.rules;
            await card.find.fill(logicOf.find);
            await card.replace.fill(logicOf.replace);
            await setSwitch(card.check('Regex'), logicOf.regex);
            await setSwitch(card.check('Ignore case'), logicOf.ignoreCase);
            const text = entry.text.repeat(entry.repeat ?? 1);
            await card.sample.fill(text);
            const expected = entry.unchanged ? text : entry.expectedRepeat ? entry.expectedRepeat.text.repeat(entry.expectedRepeat.repeat) : entry.expected!;
            await expect(card.result, entry.name).toHaveText(expected, { useInnerText: false });
        }
    });

    test('"Try it" on a catastrophic pattern says it is too slow, and the page stays responsive', async ({ page }) => {
        await page.goto('/settings');
        const list = page.getByRole('region', { name: 'Replace rules', exact: true });
        await list.getByRole('button', { name: '+ Add replace rule' }).tap();
        const card = rule(list, 1);
        await setSwitch(card.check('Regex'), true);
        await card.find.fill('(a+)+$');
        await card.replace.fill('b');
        await card.sample.fill(`${'a'.repeat(40)}!`);
        await expect(card.result).toHaveText('This pattern is too slow');
        // The API refuses to save it too.
        await expect(card.card.getByRole('alert')).toHaveText('This pattern is too slow');

        // The page still answers: a tap elsewhere works at once.
        await setSwitch(card.check('Ignore case'), true);
        await list.getByRole('button', { name: '+ Add replace rule' }).tap();
        await expect(rule(list, 2).find).toBeFocused({ timeout: 2_000 });
        // A new keystroke runs it again: a sane sample now finishes.
        await card.sample.fill('aaa');
        await expect(card.result).toHaveText('b');
    });
});

test.describe('Replace rules on AI Messages as shown', () => {
    test.beforeEach(async ({ request }) => clearAppWide(request));
    test.afterEach(async ({ request }) => clearAppWide(request));

    const LIGHTHOUSE_OPENING = `The lamp went out an hour ago. A shiver ran down her spine.

Rain hammers the glass.

@Mira: Boots off, keeper. The lamp won't light itself.`;
    const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
    const NO_OPS = '{"operations":[]}';

    async function lighthouseChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
        const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
        const storyId = (await created.json()).id as number;
        await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse, 1890s.', opening: LIGHTHOUSE_OPENING } });
        await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
        await request.post(`/api/stories/${storyId}/characters`, {
            data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        await request.delete('/api/testing/fake-gateway');
        const chat = await request.post(`/api/stories/${storyId}/chats`);
        expect(chat.ok()).toBe(true);
        return { storyId, chatId: (await chat.json()).id as number };
    }

    async function scriptTurn(request: APIRequestContext, reply: object | string) {
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [reply] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    }

    test('a Story rule changes a word as shown, names stay, Edit shows the stored text, and parking the rule brings it back', async ({ page, request }) => {
        const { storyId, chatId } = await lighthouseChat(request);
        await request.post(`/api/stories/${storyId}/replace-rules`, { data: { find: 'lamp', replace: 'lantern', ignoreCase: true } });
        // A name in a rule changes it in the text, never as the speaker's name.
        const named = await request.post(`/api/stories/${storyId}/replace-rules`, { data: { find: 'Mira', replace: 'Mirabel' } });
        expect(named.ok()).toBe(true);
        // A rule can remove a whole narration paragraph.
        await request.post(`/api/stories/${storyId}/replace-rules`, { data: { find: 'Rain hammers the glass.', replace: '' } });
        // Asterisks written into speech become italics; into narration they show as typed.
        await request.post(`/api/stories/${storyId}/replace-rules`, { data: { find: 'Boots off,', replace: '*points at the mat*' } });
        await request.post(`/api/stories/${storyId}/replace-rules`, { data: { find: 'A shiver ran down her spine.', replace: '*shivers*' } });
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const opening = page.getByRole('article', { name: 'Opening' });
            await expect(opening).toContainText('The lantern went out an hour ago. *shivers*');
            await expect(opening).not.toContainText('Rain hammers');
            const mira = opening.getByRole('group', { name: 'Mira', exact: true });
            await expect(mira).toContainText("keeper. The lantern won't light itself.");
            await expect(mira.locator('em')).toHaveText('points at the mat');
            await expect(opening.getByRole('group', { name: 'Mirabel' })).toHaveCount(0);

            // Edit shows what is stored.
            await opening.tap();
            await opening.getByRole('button', { name: 'Edit' }).tap();
            const box = page.getByRole('textbox', { name: 'Message text' });
            await expect(box).toHaveValue(/The lamp went out an hour ago\. A shiver ran down her spine\./);
            await expect(box).toHaveValue(/Rain hammers the glass\./);
            await expect(box).toHaveValue(/@Mira: Boots off, keeper\. The lamp won't light itself\./);
            await page.getByRole('button', { name: 'Cancel' }).tap();

            // Parking the rules brings the stored text back, with no change to what is stored.
            const rules = ((await (await request.get(`/api/stories/${storyId}`)).json()) as { replaceRules: StoredRule[] }).replaceRules;
            for (const stored of rules) await request.patch(`/api/stories/${storyId}/replace-rules/${stored.id}`, { data: { onAi: false } });
            await page.reload();
            await expect(page.getByRole('article', { name: 'Opening' })).toContainText('The lamp went out an hour ago. A shiver ran down her spine.');
            await expect(page.getByRole('article', { name: 'Opening' })).toContainText('Rain hammers the glass.');
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test("an app-wide and a Story rule apply in order, also while a reply streams, and the downloaded Transcript reads the same", async ({ page, request }) => {
        const { storyId, chatId } = await lighthouseChat(request);
        // App-wide first: logbook → ledger; then the Story's turns ledger → diary. Only order makes "diary".
        await request.post('/api/replace-rules', { data: { find: 'logbook', replace: 'ledger' } });
        await request.post(`/api/stories/${storyId}/replace-rules`, { data: { find: 'ledger', replace: 'diary' } });
        // On my Messages only: it never touches AI Messages as shown.
        await request.post('/api/replace-rules', { data: { find: 'Rain', replace: 'Sleet', onAi: false, onMine: true } });
        const reply = 'Rain lashes the glass. She opens the logbook.\n\n@Mira: Sign the logbook, keeper, and mind the oil on the stairs.\n\nShe slides it across the table without looking up.';
        await scriptTurn(request, { text: reply, model: 'glm-5.3', pieceSize: 4, pieceDelayMs: 60 });
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const composer = page.getByRole('form', { name: 'Composer' });
            await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('Evening.');
            await composer.getByRole('button', { name: 'Send' }).tap();

            // While it is still being written, the reply already reads as shown.
            const replyArticle = page.getByRole('article', { name: 'AI reply' });
            const writing = page.getByRole('status').filter({ hasText: 'Writing' });
            await expect(replyArticle).toContainText('She opens the diary.');
            await expect(writing).toBeVisible();
            await expect(replyArticle).not.toContainText('without looking up');
            await expect(replyArticle).not.toContainText('ledger');

            await expect(writing).toHaveCount(0);
            await expect(replyArticle.getByRole('group', { name: 'Mira', exact: true })).toContainText('Sign the diary, keeper');
            await expect(replyArticle).toContainText('Rain lashes the glass.');
            await expect(replyArticle).not.toContainText('logbook');

            // What is stored is the reply as the model wrote it.
            const stored = (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()) as { messages: Array<{ parts?: Array<{ text: string }> }> };
            expect(JSON.stringify(stored.messages.at(-1))).toContain('She opens the logbook.');

            await page.getByRole('button', { name: 'Chat menu' }).tap();
            const downloading = page.waitForEvent('download');
            await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('link', { name: /Download as text/ }).tap();
            const text = await readFileAsync(await (await downloading).path(), 'utf8');
            expect(text).toContain('Rain lashes the glass. She opens the diary.');
            expect(text).toContain('Mira: Sign the diary, keeper, and mind the oil on the stairs.');
            expect(text).not.toContain('logbook');
            expect(text).toContain('Ash: Evening.');
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

test.describe('Replace rules on my Messages before sending', () => {
    test.beforeEach(async ({ request }) => clearAppWide(request));
    test.afterEach(async ({ request }) => clearAppWide(request));

    const OPENING_TEXT = 'The lamp went out an hour ago.\n\n@Mira: What colour is the sea tonight, keeper?';
    const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
    const NO_OPS = '{"operations":[]}';

    async function chatWithRules(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
        const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
        const storyId = (await created.json()).id as number;
        await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse, 1890s.', opening: OPENING_TEXT } });
        await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
        await request.post(`/api/stories/${storyId}/characters`, {
            data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        // On my Messages: an app-wide shorthand, then a Story spelling. Each gives the same result run twice.
        expect((await request.post('/api/replace-rules', { data: { find: '\\bu\\b', replace: 'you', regex: true, onAi: false, onMine: true } })).ok()).toBe(true);
        expect((await request.post(`/api/stories/${storyId}/replace-rules`, { data: { find: 'colour', replace: 'color', onAi: false, onMine: true } })).ok()).toBe(true);
        // On AI Messages only: never touches my text.
        expect((await request.post(`/api/stories/${storyId}/replace-rules`, { data: { find: 'like', replace: 'love' } })).ok()).toBe(true);
        // A draft of nothing but "hmm" is emptied.
        expect((await request.post('/api/replace-rules', { data: { find: '^\\s*hm+\\s*$', replace: '', regex: true, onAi: false, onMine: true } })).ok()).toBe(true);
        await request.delete('/api/testing/fake-gateway');
        const chat = await request.post(`/api/stories/${storyId}/chats`);
        expect(chat.ok()).toBe(true);
        return { storyId, chatId: (await chat.json()).id as number };
    }

    async function scriptTurn(request: APIRequestContext, reply: object | string) {
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [reply] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    }

    async function userTexts(request: APIRequestContext, storyId: number, chatId: number): Promise<string[]> {
        const chat = (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()) as { messages: Array<{ kind: string; text?: string }> };
        return chat.messages.filter((message) => message.kind === 'user').map((message) => message.text!);
    }

    async function lastTurnPrompt(request: APIRequestContext): Promise<string> {
        const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as { calls: Array<{ request: { kind?: string } }> };
        return JSON.stringify(calls.filter((call) => call.request?.kind === 'turn').at(-1));
    }

    test('an On my Messages rule changes what is sent, shown and stored; sending that text again sends it unchanged', async ({ page, request }) => {
        const { storyId, chatId } = await chatWithRules(request);
        await scriptTurn(request, { text: '@Mira: Grey, like your colour scheme.', model: 'glm-5.3', pieceSize: 4, pieceDelayMs: 40 });
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const composer = page.getByRole('form', { name: 'Composer' });
            const box = composer.getByRole('textbox', { name: 'Write as Ash' });
            await box.fill('Do u like the colour? I like it.');
            await composer.getByRole('button', { name: 'Send' }).tap();

            // The pending bubble already shows what is sent.
            const said = page.getByRole('article', { name: 'Ash said' });
            await expect(said).toHaveText(/Do you like the color\? I like it\./);
            await expect(page.getByRole('status').filter({ hasText: 'Writing' })).toHaveCount(0);
            expect(await userTexts(request, storyId, chatId)).toEqual(['Do you like the color? I like it.']);
            expect(await lastTurnPrompt(request)).toContain('Do you like the color? I like it.');
            // A rule only on my Messages leaves AI Messages as shown; one only on AI Messages changed the reply instead.
            await expect(page.getByRole('article', { name: 'Opening' })).toContainText('What colour is the sea tonight');
            await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Grey, love your colour scheme.');

            await page.reload();
            await expect(page.getByRole('article', { name: 'Ash said' })).toHaveText(/Do you like the color\? I like it\./);

            // The stored text sent again as a new draft (a Branch's draft, say) goes unchanged.
            await scriptTurn(request, '@Mira: You asked that already.');
            await box.fill('Do you like the color? I like it.');
            await composer.getByRole('button', { name: 'Send' }).tap();
            await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('You asked that already.');
            expect(await userTexts(request, storyId, chatId)).toEqual(['Do you like the color? I like it.', 'Do you like the color? I like it.']);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('a draft the rules leave empty is not sent; the draft stays and the composer says why', async ({ page, request }) => {
        const { storyId, chatId } = await chatWithRules(request);
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const composer = page.getByRole('form', { name: 'Composer' });
            const box = composer.getByRole('textbox', { name: 'Write as Ash' });
            await box.fill('  hmmm ');
            await composer.getByRole('button', { name: 'Send' }).tap();
            await expect(page.getByRole('alert').filter({ hasText: 'Your Replace rules left nothing to send.' })).toBeVisible();
            await expect(box).toHaveValue('  hmmm ');
            await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(0);
            expect(await userTexts(request, storyId, chatId)).toEqual([]);
            const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as { calls: Array<{ method: string }> };
            expect(calls.filter((call) => call.method !== 'remainingCredit')).toEqual([]);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });

    test('editing a User Message saves exactly the edited text, and Retry resends the stored text', async ({ page, request }) => {
        const { storyId, chatId } = await chatWithRules(request);
        // A turn that fails leaves the User Message waiting for Retry.
        await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ error: 'outage', message: 'DeepInfra answered 503.' }] } });
        try {
            await page.goto(`/stories/${storyId}/chats/${chatId}`);
            const composer = page.getByRole('form', { name: 'Composer' });
            await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('Is the colour right?');
            await composer.getByRole('button', { name: 'Send' }).tap();
            await expect(page.getByText('The last turn failed. Your message is kept.')).toBeVisible();
            expect(await userTexts(request, storyId, chatId)).toEqual(['Is the color right?']);

            // Retry sends the stored Message again, as it is.
            await scriptTurn(request, '@Mira: Close enough.');
            await page.getByRole('button', { name: 'Retry' }).tap();
            await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Close enough.');
            expect(await lastTurnPrompt(request)).toContain('Is the color right?');

            // An edit saves exactly what was typed: no rule runs on it.
            await scriptTurn(request, '@Mira: Better.');
            const said = page.getByRole('article', { name: 'Ash said' });
            await said.tap();
            await said.getByRole('button', { name: 'Edit' }).tap();
            const edit = page.getByRole('form', { name: /^Edit/ });
            await edit.getByRole('textbox', { name: 'Message text' }).fill('Do u like the colour now?');
            await edit.getByRole('button', { name: 'Save', exact: true }).tap();
            // Its reply comes after it, so saving asks first.
            await page.getByRole('button', { name: 'Save and rewind' }).tap();
            await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Better.');
            await expect(page.getByRole('article', { name: 'AI reply' })).toHaveCount(1);
            expect(await userTexts(request, storyId, chatId)).toEqual(['Do u like the colour now?']);
        } finally {
            await request.delete(`/api/stories/${storyId}`);
        }
    });
});

import AxeBuilder from '@axe-core/playwright';
import { APIRequestContext, expect, test } from '@playwright/test';

// Diary (.scratch/diary/spec.md), on a phone: a Character's profile asks them for an entry about the
// story so far, keeps it, offers the next one only once the story has gone on, and loses an entry
// with the reply it told of.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';
const NO_CHANGE = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'nothing yet' } });

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse', setting: 'A lighthouse on a storm-cut island.', opening: OPENING } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded.', voice: 'Short sentences.', secrets: 'She put the lamp out herself.' },
    });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

async function scriptTurn(request: APIRequestContext, reply: string) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

async function scriptEntry(request: APIRequestContext, text: string) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'diary_entry', replies: [text] } });
}

test("a Character's profile holds their Diary: an entry on request, the next one after the story goes on, and Again takes one back", async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete('/api/testing/fake-gateway');
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const composer = page.getByRole('form', { name: 'Composer' });
        const openProfile = async () => {
            // Her Portrait beside her newest line: in the Opening at first, in a reply after.
            await page.getByRole('region', { name: 'Messages' }).getByRole('button', { name: 'Profile of Mira' }).last().tap();
            const sheet = page.getByRole('dialog', { name: 'Mira' });
            await expect(sheet.getByRole('heading', { name: 'Diary' })).toBeVisible();
            return sheet;
        };
        const closeProfile = async () => {
            await page.keyboard.press('Escape');
            await expect(page.getByRole('dialog', { name: 'Mira' })).toHaveCount(0);
        };

        // An empty Diary: what it is, and one button.
        let profile = await openProfile();
        const diary = () => page.getByRole('dialog', { name: 'Mira' }).getByRole('region', { name: 'Diary' });
        await expect(diary()).toContainText('What Mira writes in private about the story so far, when you ask.');
        await expect(diary().locator('[data-diary-entry]')).toHaveCount(0);

        await scriptEntry(request, 'A new keeper. Soft hands.\n\nWe will see how long he lasts.');
        await diary().getByRole('button', { name: 'Write an entry' }).tap();
        const first = diary().locator('[data-diary-entry]');
        await expect(first).toHaveCount(1);
        await expect(first).toContainText('A new keeper. Soft hands.');
        await expect(first).toContainText('We will see how long he lasts.');
        // One entry per moment: the button gives way until the story goes on.
        await expect(diary()).toContainText('Up to date. Play on, then ask for the next entry.');
        await expect(diary().getByRole('button', { name: /Write/ })).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
        expect(axe.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
        await closeProfile();

        // The writer was told who she is, never her Secrets.
        const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as {
            calls: Array<{ request: { kind?: string; messages?: Array<{ content: string }> } }>;
        };
        const asked = calls.filter((call) => call.request?.kind === 'diary_entry').at(-1)!.request.messages!;
        expect(asked[0].content).toContain('The diarist is Mira.');
        expect(asked.map((message) => message.content).join('\n')).not.toContain('She put the lamp out herself.');
        expect(asked[1].content).toContain('Mira: Boots off, keeper.');

        // The story goes on: the next entry is on offer, and the earlier one folds away behind it.
        await scriptTurn(request, 'Rain hammers the glass as you climb.\n\n@Mira: Mind the oil.');
        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('I follow her up.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        const reply = page.getByRole('article', { name: 'AI reply' }).last();
        await expect(reply).toContainText('Mind the oil.');

        profile = await openProfile();
        await expect(profile.locator('[data-diary-entry]')).toHaveCount(1);
        await scriptEntry(request, 'He followed me up without being told twice.');
        await diary().getByRole('button', { name: 'Write the next entry' }).tap();
        await expect(diary().locator('[data-diary-entry]')).toHaveCount(1);
        await expect(diary().locator('[data-diary-entry]')).toContainText('He followed me up without being told twice.');
        const earlier = diary().getByRole('button', { name: 'Show 1 earlier entry' });
        await earlier.tap();
        await expect(diary().locator('[data-diary-entry]')).toHaveCount(2);
        await expect(diary().locator('[data-diary-entry]').nth(1)).toContainText('A new keeper. Soft hands.');
        await closeProfile();

        // Again writes the reply anew: the entry that told of it goes, the one before stays.
        await scriptTurn(request, '@Mira: Stay by the lamp.');
        await reply.getByRole('button', { name: 'Again' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Stay by the lamp.');
        profile = await openProfile();
        await expect(profile.locator('[data-diary-entry]')).toHaveCount(1);
        await expect(profile.locator('[data-diary-entry]')).toContainText('A new keeper. Soft hands.');
        await expect(diary().getByRole('button', { name: 'Write the next entry' })).toBeVisible();

        // A failed ask says so and keeps nothing; a deleted entry is gone for good.
        await scriptEntry(request, '   ');
        await diary().getByRole('button', { name: 'Write the next entry' }).tap();
        await expect(diary().getByRole('alert')).toContainText("Couldn't write the diary entry. Try again.");
        await expect(profile.locator('[data-diary-entry]')).toHaveCount(1);

        await diary().getByRole('button', { name: /^Delete the entry of/ }).tap();
        await diary().getByRole('group', { name: 'Delete this entry?' }).getByRole('button', { name: 'Delete' }).tap();
        await expect(profile.locator('[data-diary-entry]')).toHaveCount(0);
        await expect(diary().getByRole('button', { name: 'Write an entry' })).toBeVisible();
        const left = await request.get(`/api/stories/${storyId}/chats/${chatId}/diary`);
        expect((await left.json()).entries).toEqual([]);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

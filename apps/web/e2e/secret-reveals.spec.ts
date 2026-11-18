import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { openCard } from './harness/editor';

// Secret reveals (.scratch/secret-reveals/spec.md) on the user's phone, at 360px and at 320px: the
// author gives a Secret a Bond level by its word; once the Bond holds it and a reply tells it, a
// "Secret revealed" card shows under that reply and the Secret shows in the Character's profile.
test.use({ hasTouch: true, isMobile: true });

const MARRIED = 'She was married once, to the bandit chief.';
const BOOK = 'She burned the old herd book.';
const NO_OPS = '{"operations":[]}';

async function createStory(request: APIRequestContext): Promise<{ storyId: number; nara: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Steppe' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'The open steppe.', opening: 'The fire is low.\n\n@Nara: You again.' } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'A rider.' } });
    const story = await (
        await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Nara', appearance: 'Tall.', personality: 'Proud.', voice: 'Dry.' } })
    ).json();
    const nara = story.characters[0].id as number;
    // Trust starts at "inclined to trust".
    await request.post(`/api/stories/${storyId}/starting-bonds`, { data: { fromCharacterId: nara, toCharacterId: null, label: 'Wary', description: 'She watches Ash.', trust: 1 } });
    return { storyId, nara };
}

async function scriptTurn(request: APIRequestContext, reply: string, judge: Record<string, unknown>) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'judge', replies: [JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'no' }, ...judge })] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

async function lastTurnClosing(request: APIRequestContext): Promise<string> {
    const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as {
        calls: Array<{ request: { kind?: string; messages?: Array<{ content: string }> } }>;
    };
    return calls.filter((call) => call.request?.kind === 'turn').at(-1)!.request.messages!.at(-1)!.content;
}

/** Nothing on the page is wider than the screen. */
async function fitsWidth(page: Page, width: number) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

for (const width of [360, 320]) {
    test(`at ${width}px: a Secret given a Bond level in the editor comes out as a card in the thread and shows in the profile`, async ({ page, request }) => {
        await page.setViewportSize({ width, height: 780 });
        const { storyId, nara } = await createStory(request);
        await request.delete('/api/testing/fake-gateway');
        try {
            // The author adds a Secret and gives it a level by its word.
            await page.goto(`/stories/${storyId}?tab=characters`);
            const card = await openCard(page, 'Character 1');
            const list = card.locator('[data-secret-list]');
            await list.getByRole('button', { name: 'Add secret' }).click();
            const secret = list.getByRole('listitem', { name: 'Secret 1' });
            await secret.getByRole('textbox', { name: 'Secret 1' }).fill(MARRIED);
            await secret.getByLabel('Told once').selectOption({ label: 'Their Trust toward Ash has grown' });
            await secret.getByLabel('At least').selectOption({ label: 'inclined to trust' });
            await expect(secret.getByLabel('At least').locator('option:checked')).toHaveText('inclined to trust');
            // The level is a word; no number shows.
            await expect(secret.getByLabel('At least')).not.toContainText(/\d/);
            await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');
            await fitsWidth(page, width);
            const story = await (await request.get(`/api/stories/${storyId}`)).json();
            expect(story.characters[0].secretList).toEqual([{ id: expect.any(Number), text: MARRIED, axis: 'trust', atLeast: 1 }]);

            // A second, further off: never shown in play.
            const added = await (await request.post(`/api/stories/${storyId}/characters/${nara}/secrets`)).json();
            const second = added.characters[0].secretList.at(-1).id as number;
            await request.patch(`/api/stories/${storyId}/characters/${nara}/secrets/${second}`, { data: { text: BOOK, axis: 'trust', atLeast: 3 } });

            const chat = await request.post(`/api/stories/${storyId}/chats`);
            expect(chat.ok()).toBe(true);
            const chatId = (await chat.json()).id as number;
            await request.patch(`/api/stories/${storyId}/chats/${chatId}`, { data: { characterThoughts: false } });
            await page.goto(`/stories/${storyId}/chats/${chatId}`);

            await scriptTurn(request, `@Nara: I was married once. To the bandit chief.`, { secrets_revealed: [1] });
            const composer = page.getByRole('form', { name: 'Composer' });
            await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('Tell me something true.');
            await composer.getByRole('button', { name: 'Send' }).tap();
            const reply = page.getByRole('article', { name: 'AI reply' }).last();
            await expect(reply).toContainText('bandit chief');
            // The reply was written with the Secret on offer.
            expect(await lastTurnClosing(request)).toContain(`may now tell Ash this, if and when the moment truly fits; never force it or steer toward it: ${MARRIED}`);

            // Once the Judge settles, the card shows under the reply that told it.
            const revealed = reply.getByRole('complementary', { name: 'Secret revealed by Nara' });
            await expect(async () => {
                await page.reload();
                await expect(page.getByRole('article', { name: 'AI reply' }).last().getByRole('complementary', { name: 'Secret revealed by Nara' })).toBeVisible({ timeout: 2_000 });
            }).toPass({ timeout: 15_000 });
            await expect(revealed).toContainText('Secret revealed');
            await expect(revealed).toContainText(`Nara: ${MARRIED}`);
            const box = (await revealed.boundingBox())!;
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
            await fitsWidth(page, width);
            await expect(page.locator('body')).not.toContainText(BOOK);

            // The profile shows it under "Secrets shared with you", and never the one not yet told.
            await page.getByRole('article', { name: 'Opening' }).getByRole('button', { name: 'Profile of Nara' }).tap();
            const profile = page.getByRole('dialog', { name: 'Nara' });
            const shared = profile.locator('[data-revealed-secrets]');
            await expect(shared.getByRole('heading', { name: 'Secrets shared with you' })).toBeVisible();
            await expect(shared).toContainText(MARRIED);
            await expect(profile).not.toContainText(BOOK);
            await fitsWidth(page, width);
            await profile.getByRole('button', { name: 'Close' }).tap();

            // Again on the reply takes the reveal back: the card goes.
            await scriptTurn(request, '@Nara: Not tonight.', {});
            await page.getByRole('article', { name: 'AI reply' }).last().getByRole('button', { name: 'Again' }).tap();
            await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Not tonight');
            await expect(async () => {
                await page.reload();
                await expect(page.getByRole('complementary', { name: 'Secret revealed by Nara' })).toHaveCount(0, { timeout: 2_000 });
            }).toPass({ timeout: 15_000 });
        } finally {
            await request.delete('/api/testing/fake-gateway');
            await request.delete(`/api/stories/${storyId}`);
        }
    });
}

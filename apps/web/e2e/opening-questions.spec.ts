import { APIRequestContext, expect, Page, test } from '@playwright/test';

import { openCard } from './harness/editor';

// Opening questions (.scratch/opening-questions/spec.md) on the user's phone: 360px wide, with
// touch, and 320px for the narrowest. Everyone in the Story is an adult.
test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

const QUESTIONS = [
    { key: 'name', question: 'What is your name?', defaultAnswer: 'Ash' },
    { key: 'trade', question: 'What is your trade?', defaultAnswer: 'keeper' },
];

async function playableStory(request: APIRequestContext, options: { questions?: object[]; opening?: string; title?: string } = {}): Promise<number> {
    const created = await request.post('/api/stories', { data: { title: options.title ?? 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a cliff.', opening: options.opening ?? 'Rain hammers the glass as {name} climbs the stair.\n\n@Mira: You are the new {trade}?' },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: '{name}', description: '{name}, a {trade} sent to keep the lamp.' } });
    const mira = await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' } });
    expect(mira.ok()).toBe(true);
    if (options.questions) expect((await request.put(`/api/stories/${storyId}/opening-questions`, { data: { openingQuestions: options.questions } })).ok()).toBe(true);
    return storyId;
}

const pageWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test('the author adds, orders and removes Opening questions on the Story tab, and is told which placeholders are unused', async ({ page, request }) => {
    const storyId = await playableStory(request, { opening: 'Rain hammers the glass.' });
    try {
        // The Role says {name}, and nothing says {trade} yet.
        await request.patch(`/api/stories/${storyId}/role`, { data: { description: '{name}, sent to keep the lamp.' } });
        await page.goto(`/stories/${storyId}`);
        const card = await openCard(page, 'Opening questions');
        const saved = page.getByRole('status').filter({ hasText: /Saved|Saving/ });

        await card.getByRole('button', { name: 'Add question' }).tap();
        const first = card.getByRole('group', { name: 'Question 1' });
        await first.getByLabel('Question', { exact: true }).fill('What is your name?');
        // Typed as "My Name": kept as a placeholder can be written.
        await first.getByLabel('Placeholder', { exact: true }).fill('My Name');
        await expect(first.getByLabel('Placeholder', { exact: true })).toHaveValue('my_name');
        await first.getByLabel('Placeholder', { exact: true }).fill('name');
        await first.getByLabel('Default answer').fill('Ash');
        // The Role already says {name}.
        await expect(first).toContainText('Write {name} where the answer goes.');

        await card.getByRole('button', { name: 'Add question' }).tap();
        const second = card.getByRole('group', { name: 'Question 2' });
        await second.getByLabel('Question', { exact: true }).fill('What is your trade?');
        await second.getByLabel('Placeholder', { exact: true }).fill('name');
        await expect(second.getByRole('alert')).toHaveText('Another question already uses {name}.');
        await second.getByLabel('Placeholder', { exact: true }).fill('trade');
        await second.getByLabel('Default answer').fill('keeper');
        await expect(second).toContainText('Write {trade} in the Opening or the Role. Neither uses it yet.');
        await expect(saved).toHaveText('Saved');

        // The Opening now says {trade}.
        await page.getByLabel('Opening', { exact: true }).fill('Rain hammers the glass. {trade}?');
        await expect(second).toContainText('Write {trade} where the answer goes.');
        await expect(saved).toHaveText('Saved');
        expect(await pageWidth(page)).toBeLessThanOrEqual(360);

        await second.getByRole('button', { name: 'Move question 2 up' }).tap();
        await expect(card.getByRole('group', { name: 'Question 1' }).getByLabel('Placeholder', { exact: true })).toHaveValue('trade');
        await expect(card.getByRole('button', { name: 'Move question 1 down' })).toBeFocused();
        await expect(saved).toHaveText('Saved');
        expect((await (await request.get(`/api/stories/${storyId}`)).json()).openingQuestions).toEqual([QUESTIONS[1], QUESTIONS[0]]);

        await card.getByRole('button', { name: 'Remove question 1' }).tap();
        await expect(card.getByRole('group')).toHaveCount(1);
        await card.getByRole('button', { name: 'Undo' }).tap();
        await expect(card.getByRole('group', { name: 'Question 2' })).toBeVisible();
        await card.getByRole('button', { name: 'Remove question 2' }).tap();
        await expect(saved).toHaveText('Saved');

        await page.reload();
        const reloaded = await openCard(page, 'Opening questions');
        await expect(reloaded.getByRole('group')).toHaveCount(1);
        await expect(reloaded.getByRole('group', { name: 'Question 1' }).getByLabel('Placeholder', { exact: true })).toHaveValue('trade');
        expect((await (await request.get(`/api/stories/${storyId}`)).json()).openingQuestions).toEqual([QUESTIONS[1]]);

        // The narrowest phone: the card's buttons wrap, nothing scrolls sideways.
        await page.setViewportSize({ width: 320, height: 640 });
        await expect(reloaded.getByRole('button', { name: 'Remove question 1' })).toBeVisible();
        expect(await pageWidth(page)).toBeLessThanOrEqual(320);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('New Chat asks the questions on a 360px phone; the answers fill the Opening, and a blank one takes its default', async ({ page, request }) => {
    const storyId = await playableStory(request, { questions: QUESTIONS });
    try {
        await page.goto(`/stories/${storyId}/chats`);
        await page.getByRole('button', { name: 'New Chat' }).tap();
        await expect(page).toHaveURL(`/stories/${storyId}/new-chat`);

        const form = page.getByRole('form', { name: 'Opening questions' });
        await expect(form.getByLabel('What is your name?')).toHaveAttribute('placeholder', 'Ash');
        await expect(form.getByText('Default: keeper')).toBeVisible();
        expect(await pageWidth(page)).toBeLessThanOrEqual(360);
        for (const control of [form.getByLabel('What is your name?'), form.getByRole('button', { name: 'Start' }), form.getByRole('button', { name: 'Skip, use the defaults' })]) {
            expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }

        await form.getByLabel('What is your name?').fill('Petch');
        await form.getByRole('button', { name: 'Start' }).tap();
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats/\\d+$`));
        await expect(page.getByText('Rain hammers the glass as Petch climbs the stair.')).toBeVisible();
        await expect(page.getByText('You are the new keeper?')).toBeVisible();
        const chatId = Number(page.url().split('/').pop());
        const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
        expect(chat.openingAnswers).toEqual({ name: 'Petch', trade: 'keeper' });
        expect(chat.identityName).toBe('Petch');

        // The form stood in for itself: Back goes to the Chats.
        await page.goBack();
        await expect(page).toHaveURL(`/stories/${storyId}/chats`);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test('at 320px the form fits, and Skip uses every default', async ({ page, request }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const storyId = await playableStory(request, { questions: QUESTIONS });
    try {
        await page.goto(`/stories/${storyId}/new-chat`);
        const form = page.getByRole('form', { name: 'Opening questions' });
        await form.getByLabel('What is your trade?').fill('herder');
        expect(await pageWidth(page)).toBeLessThanOrEqual(320);
        const box = (await form.getByRole('button', { name: 'Skip, use the defaults' }).boundingBox())!;
        expect(box.x + box.width).toBeLessThanOrEqual(320);

        await form.getByRole('button', { name: 'Skip, use the defaults' }).tap();
        await expect(page).toHaveURL(new RegExp(`/stories/${storyId}/chats/\\d+$`));
        await expect(page.getByText('Rain hammers the glass as Ash climbs the stair.')).toBeVisible();
        await expect(page.getByText('You are the new keeper?')).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

test("Home's New Chat goes to the questions; a Story that asks none starts its Chat at once, as before", async ({ page, request }) => {
    const asking = await playableStory(request, { questions: QUESTIONS, title: 'Saltwind Questions' });
    const plain = await playableStory(request, { opening: 'Rain hammers the glass as {name} climbs.', title: 'Saltwind Plain' });
    try {
        await page.goto('/');
        await page.getByRole('list', { name: 'Stories' }).getByRole('button', { name: /Saltwind Questions/ }).tap();
        await page.getByRole('dialog', { name: 'Saltwind Questions' }).getByRole('button', { name: 'New Chat' }).tap();
        await expect(page).toHaveURL(`/stories/${asking}/new-chat`);

        await page.goto(`/stories/${plain}/chats`);
        await page.getByRole('button', { name: 'New Chat' }).tap();
        await expect(page).toHaveURL(new RegExp(`/stories/${plain}/chats/\\d+$`));
        // Braces in a Story without questions are its own text.
        await expect(page.getByText('Rain hammers the glass as {name} climbs.')).toBeVisible();
    } finally {
        await request.delete(`/api/stories/${asking}`);
        await request.delete(`/api/stories/${plain}`);
    }
});

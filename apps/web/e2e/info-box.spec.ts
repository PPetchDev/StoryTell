import { APIRequestContext, expect, test } from '@playwright/test';

// Place, Weather and Outfits (.scratch/info-box/spec.md), on a phone: what the Judge reads from
// each reply shows in the Scene strip, in a Character's profile, and in the next turn's prompt.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';

function judgement(details?: Record<string, unknown>): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'nothing yet' }, ...(details ? { details } : {}) });
}

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse', setting: 'A lighthouse on a storm-cut island.', opening: OPENING } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, { data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded.', voice: 'Short sentences.' } });
    await request.post(`/api/stories/${storyId}/scenes`, { data: { name: 'Arrival', situation: 'Reach the lamp room before the storm closes the stair.' } });
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

async function scriptTurn(request: APIRequestContext, reply: string, judge = judgement()) {
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: reply, model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [judge] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
}

async function lastTurnTrailing(request: APIRequestContext): Promise<string> {
    const { calls } = (await (await request.get('/api/testing/fake-gateway/calls')).json()) as {
        calls: Array<{ request: { kind?: string; messages?: Array<{ content: string }> } }>;
    };
    return calls.filter((call) => call.request?.kind === 'turn').at(-1)!.request.messages!.at(-1)!.content;
}

test('the Scene strip shows the Place once the story has one; opened, the Weather and what each Character wears; the profile and the next prompt carry them', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete('/api/testing/fake-gateway');
    try {
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const strip = page.getByRole('button', { name: /^Scene:/ });
        const composer = page.getByRole('form', { name: 'Composer' });
        // A new Chat knows none of them.
        await expect(strip).toHaveAccessibleName(/^Scene: Arrival Goal: Reach the lamp room/);
        await expect(strip.getByText(/^Place:/)).toHaveCount(0);

        await scriptTurn(
            request,
            'Rain hammers the glass as you climb.\n\n@Mira: Mind the oil.',
            judgement({ place: 'the lamp room', weather: 'a rising storm', outfits: [{ character: 'Mira', outfit: 'an oilskin coat over her nightdress' }] }),
        );
        await composer.getByRole('textbox', { name: 'Write as Ash' }).fill('I follow her up.');
        await composer.getByRole('button', { name: 'Send' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Mind the oil.');

        // Closed: the Place, after the Scene and before its goal. The Weather and the Outfits wait for a tap.
        await expect(strip).toHaveAccessibleName(/^Scene: Arrival Place: the lamp room Goal: Reach the lamp room/);
        await expect(strip).not.toContainText('a rising storm');
        await expect(strip.locator('[data-outfit]')).toHaveCount(0);
        expect((await strip.boundingBox())!.width).toBeLessThanOrEqual(390);

        await strip.tap();
        await expect(strip).toHaveAttribute('aria-expanded', 'true');
        await expect(strip).toHaveAccessibleName(/Place: the lamp room Weather: a rising storm Goal: /);
        await expect(strip.locator('[data-outfit]')).toHaveText(/Mira\s*is wearing\s*an oilskin coat over her nightdress/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
        await strip.tap();

        // Her profile says what she is wearing now, above what she looks like.
        await page.getByRole('article', { name: 'AI reply' }).last().getByRole('button', { name: 'Profile of Mira' }).tap();
        const profile = page.getByRole('dialog', { name: 'Mira' });
        await expect(profile.getByRole('heading', { name: 'Wearing now' })).toBeVisible();
        await expect(profile).toContainText('an oilskin coat over her nightdress');
        await page.keyboard.press('Escape');
        await expect(profile).toHaveCount(0);

        // The next reply is written knowing them, and a change shows once its judge settles.
        await scriptTurn(request, '@Mira: Down, before the stair floods.', judgement({ place: 'the quay' }));
        await composer.getByRole('button', { name: 'Continue' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('before the stair floods');
        expect(await lastTurnTrailing(request)).toContain(
            'Place: the lamp room. Weather: a rising storm. In the latest exchange: Mira. Wearing now: Mira, an oilskin coat over her nightdress.',
        );
        await expect(strip).toHaveAccessibleName(/Place: the quay/);

        // Again takes the reply's change back.
        const reply = page.getByRole('article', { name: 'AI reply' }).last();
        await scriptTurn(request, '@Mira: Stay by the lamp.');
        await reply.getByRole('button', { name: 'Again' }).tap();
        await expect(page.getByRole('article', { name: 'AI reply' }).last()).toContainText('Stay by the lamp.');
        await expect(strip).toHaveAccessibleName(/Place: the lamp room/);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

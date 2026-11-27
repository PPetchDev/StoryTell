import { APIRequestContext, expect, test } from '@playwright/test';

// Meanwhile (.scratch/meanwhile/spec.md), on a phone: what a Character away from the moment did,
// behind a tap under the reply it came after, under "Lately" on their profile, and the Chat menu's switch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const NO_OPS = '{"operations":[]}';
const KAI_DID = 'Kai won back ten crowns at dice in the Anchor tavern; he is there now.';

function judgement(extra: Record<string, unknown> = {}): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, ...extra });
}

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Harbour', setting: 'A harbour town.', opening: '@Mira: Boots off, keeper.' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    for (const [name, personality] of [
        ['Mira', 'Guarded.'],
        ['Kai', 'Proud.'],
    ]) {
        await request.post(`/api/stories/${storyId}/characters`, { data: { name, appearance: 'Tall.', personality, voice: 'Short.' } });
    }
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    // No Thoughts: this test is about what happens away from the moment.
    await request.patch(`/api/stories/${storyId}/chats/${chatId}`, { data: { characterThoughts: false } });
    return { storyId, chatId };
}

async function send(request: APIRequestContext, storyId: number, chatId: number, count: number): Promise<void> {
    await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'I climb the stair.' } });
    await expect
        .poll(
            async () => {
                const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
                const last = chat.messages.at(-1);
                return chat.messages.filter((message: { kind: string }) => message.kind === 'ai').length === count + 1 && last.judge?.status === 'done' && last.memory?.status === 'done';
            },
            { timeout: 10_000 },
        )
        .toBe(true);
}

test('what a Character did away from the moment shows on a tap and on their profile, and the Chat menu turns it off', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.delete('/api/testing/fake-gateway');
    const replies = [{ text: '@Kai: I owe the harbour master. I am off.', model: 'glm-5.3' }, ...[2, 3, 4, 5, 6].map((n) => ({ text: `@Mira: Step ${n}.`, model: 'glm-5.3' }))];
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies } });
    await request.post('/api/testing/fake-gateway/text', {
        data: { kind: 'judge', replies: [judgement({ details: { place: 'same', goals: [{ character: 'Kai', goal: 'Pay the harbour debt' }] } }), ...Array.from({ length: 5 }, () => judgement())] },
    });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: Array.from({ length: 6 }, () => NO_OPS) } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'meanwhile', replies: [JSON.stringify({ meanwhile: [{ character: 'Kai', did: KAI_DID, goal: null }] })] } });
    try {
        for (let n = 1; n <= 6; n++) await send(request, storyId, chatId, n);
        await expect
            .poll(async () => (await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).messages.at(-1).meanwhile?.length ?? 0, { timeout: 10_000 })
            .toBe(1);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        const reply = page.getByRole('article', { name: 'AI reply' }).last();
        await expect(reply).toContainText('Step 6.');

        // Behind a tap, never shown before it.
        const button = reply.getByRole('button', { name: 'Meanwhile' });
        await expect(button).toHaveAttribute('aria-expanded', 'false');
        await expect(reply).not.toContainText('Anchor tavern');
        await button.tap();
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        await expect(reply.getByRole('list', { name: 'What they did meanwhile' })).toContainText(`Kai ${KAI_DID}`);
        for (const width of [390, 360, 320]) {
            await page.setViewportSize({ width, height: 844 });
            expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }
        await page.setViewportSize({ width: 390, height: 844 });

        // On his profile, under "Lately".
        await page.getByRole('button', { name: 'Profile of Kai' }).first().tap();
        const profile = page.getByRole('dialog', { name: 'Kai' });
        await expect(profile.getByRole('heading', { name: 'Lately' })).toBeVisible();
        await expect(profile.locator('[data-lately]')).toContainText(KAI_DID);
        await page.keyboard.press('Escape');

        // The switch, on by default, off on a tap.
        await page.getByRole('button', { name: 'Chat menu' }).tap();
        const live = page.getByRole('dialog', { name: 'Chat menu' }).getByRole('switch', { name: /Characters live their own lives/ });
        await expect(live).toHaveAttribute('aria-checked', 'true');
        await live.tap();
        await expect(live).toHaveAttribute('aria-checked', 'false');
        expect((await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json()).charactersLive).toBe(false);
    } finally {
        await request.delete(`/api/stories/${storyId}`);
    }
});

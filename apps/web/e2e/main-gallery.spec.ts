import { APIRequestContext, expect, test } from '@playwright/test';
import { takeSnapshot } from './harness/snapshot';

// The Gallery grouped by Story and then by Chat (CONTEXT.md: "Gallery"), on a phone: 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const SCENE = JSON.stringify({ in_frame: ['Mira'], scene: 'Mira by the window in an oilskin coat.' });

/**
 * A playable Story with one Chat per entry of `perChat`, each with that many finished Snapshots
 * of its Opening, made through the API in order. Returns the Story's id and the Chats' ids.
 */
async function storyWithSnapshots(request: APIRequestContext, title: string, perChat: number[]): Promise<{ storyId: number; chatIds: number[] }> {
    const total = perChat.reduce((sum, count) => sum + count, 0);
    await request.delete(FAKE);
    await request.post(`${FAKE}/text`, { data: { kind: 'snapshot_prompt', replies: Array(total).fill(SCENE) } });
    await request.post(`${FAKE}/image`, { data: { kind: 'snapshot_image', replies: Array(total).fill({}) } });

    const created = await request.post('/api/stories', { data: { title, imageStyle: 'ink wash, muted' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    await request.patch(`/api/stories/${storyId}`, {
        data: { setting: 'A lighthouse on a storm-cut island.', opening: 'Rain on the glass.\n\n@Mira: Boots off.' },
    });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short sentences.' },
    });
    const chatIds: number[] = [];
    for (const count of perChat) {
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
        chatIds.push(chatId);
        const snapshots = `/api/stories/${storyId}/chats/${chatId}/snapshots`;
        for (let i = 0; i < count; i++) {
            expect((await takeSnapshot(request, storyId, chatId, `shot ${i}`)).ok()).toBe(true);
            await expect
                .poll(async () => ((await (await request.get(snapshots)).json()) as { jobs: unknown[] }).jobs.length)
                .toBe(0);
        }
    }
    return { storyId, chatIds };
}

test('the main menu Gallery groups every Story, then its Chats, each folding and remembered, and deletes from any Story', async ({
    page,
    request,
}) => {
    const stamp = Date.now();
    const lighthouse = `The Lighthouse ${stamp}`;
    const orchard = `The Orchard ${stamp}`;
    const light = await storyWithSnapshots(request, lighthouse, [2, 1]);
    const orch = await storyWithSnapshots(request, orchard, [1]);
    try {
        await page.goto('/');
        const nav = page.getByRole('navigation', { name: 'Main' });
        await nav.getByRole('link', { name: 'Gallery' }).tap();
        await expect(page).toHaveURL(/\/gallery$/);
        await expect(nav.getByRole('link', { name: 'Gallery' })).toHaveAttribute('aria-current', 'page');
        await expect(page.getByRole('heading', { name: 'Gallery', exact: true })).toBeVisible();

        // Each Story is a section with its count, its Chats inside, each a list of its own.
        const lightSection = page.getByRole('region', { name: lighthouse });
        await expect(lightSection.getByRole('heading', { name: `${lighthouse} 3 pictures` })).toBeVisible();
        await expect(lightSection.getByRole('list', { name: 'Snapshots of Chat 1' }).getByRole('listitem')).toHaveCount(2);
        await expect(lightSection.getByRole('list', { name: 'Snapshots of Chat 2' }).getByRole('listitem')).toHaveCount(1);
        // Chats in the order of their newest picture: Chat 2's came last, so it comes first.
        await expect(lightSection.getByRole('heading', { level: 3 })).toHaveText([/^Chat 2/, /^Chat 1/]);
        const orchSection = page.getByRole('region', { name: orchard });
        await expect(orchSection.getByRole('heading', { name: `${orchard} 1 picture` })).toBeVisible();

        // The viewer swipes through one Chat's pictures.
        await lightSection.getByRole('list', { name: 'Snapshots of Chat 1' }).getByRole('button').first().tap();
        const viewer = page.getByRole('dialog', { name: 'Snapshot' });
        await expect(viewer).toContainText('1 / 2');
        await page.keyboard.press('Escape');
        await expect(viewer).toHaveCount(0);

        // A Story folds, and stays folded after a reload; its Chats fold on their own too.
        const lightTitle = lightSection.getByRole('button', { name: new RegExp(`^${lighthouse}`) });
        await lightTitle.tap();
        await expect(lightTitle).toHaveAttribute('aria-expanded', 'false');
        await expect(lightSection.getByRole('list', { name: 'Snapshots of Chat 1' })).toBeHidden();
        await page.reload();
        await expect(lightSection.getByRole('button', { name: new RegExp(`^${lighthouse}`) })).toHaveAttribute('aria-expanded', 'false');
        await lightSection.getByRole('button', { name: new RegExp(`^${lighthouse}`) }).tap();
        const chatOneTitle = lightSection.getByRole('button', { name: /^Chat 1/ });
        await chatOneTitle.tap();
        await expect(lightSection.getByRole('list', { name: 'Snapshots of Chat 1' })).toBeHidden();
        await expect(lightSection.getByRole('list', { name: 'Snapshots of Chat 2' })).toBeVisible();
        await chatOneTitle.tap();

        // Deleting the Orchard's only picture from here takes its section away.
        await orchSection.getByRole('button', { name: /Snapshot with Mira/ }).tap();
        await viewer.getByRole('button', { name: 'Delete' }).click();
        await viewer.getByRole('group', { name: /Delete this Snapshot/ }).getByRole('button', { name: 'Delete' }).click();
        await expect(viewer).toHaveCount(0);
        await expect(orchSection).toHaveCount(0);
        await expect(lightSection.getByRole('listitem')).toHaveCount(3);

        // A Story's own Gallery groups by Chat only, and counts as the Gallery in the menu.
        await page.goto(`/stories/${light.storyId}/gallery?chat=${light.chatIds[0]}`);
        await expect(nav.getByRole('link', { name: 'Gallery' })).toHaveAttribute('aria-current', 'page');
        await expect(page.getByRole('region', { name: lighthouse })).toHaveCount(0);
        await expect(page.getByRole('list', { name: 'Snapshots of Chat 1' })).toBeInViewport();
        await expect(page.getByRole('list', { name: 'Snapshots of Chat 2' }).getByRole('listitem')).toHaveCount(1);
    } finally {
        await request.delete(`/api/stories/${light.storyId}`);
        await request.delete(`/api/stories/${orch.storyId}`);
    }
});

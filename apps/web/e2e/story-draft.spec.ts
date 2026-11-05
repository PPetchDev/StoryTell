import { APIRequestContext, expect, test } from '@playwright/test';

/** The fake gateway's control routes, reached through the Next.js /api proxy. */
const FAKE = '/api/testing/fake-gateway';

async function scriptText(request: APIRequestContext, kind: string, replies: unknown[]) {
    const response = await request.post(`${FAKE}/text`, { data: { kind, replies } });
    expect(response.status()).toBe(204);
}

const draft = {
    title: 'The Lighthouse',
    setting: 'A lighthouse on a storm-cut island, 1890s.',
    opening: 'The lamp went out an hour ago.',
    style: { pov: 'first', tense: 'present', replyLength: 'short', imageStyle: 'ink wash, muted' },
    role: { name: 'The new keeper', description: 'Arrived this morning, knows nothing of the island.' },
    characters: [
        {
            name: 'Mira',
            appearance: 'Tall, grey eyes, a scar across one eyebrow.',
            personality: 'Guarded and dry, warms slowly.',
            voice: 'Short sentences. Never says please.',
            secrets: 'She put the lamp out herself.',
        },
    ],
    startingBonds: [{ from: 'Mira', toward: 'role', label: 'wary', description: 'Watches every move.' }],
    scenes: [{ name: 'Arrival', situation: 'Reach the lamp room.' }],
};

test.afterEach(async ({ request }) => {
    await request.delete(FAKE);
});

test('drafts a playable Story from an idea after one failed try, then rewrites a single field', async ({
    page,
    request,
}) => {
    // The first draft call fails at the provider; Retry runs the same idea again and gets the Story.
    await scriptText(request, 'story_draft', [
        { error: 'outage', message: 'OpenRouter: DeepInfra is down.' },
        JSON.stringify(draft),
    ]);

    await page.goto('/');
    await page.getByRole('button', { name: 'New Story' }).click();
    const panel = page.getByRole('region', { name: 'New Story' });
    const idea = 'A lighthouse keeper arrives on a storm-cut island and meets the woman who put the lamp out.';
    await panel.getByLabel('Idea').fill(idea);
    await panel.getByRole('button', { name: 'Draft from idea' }).click();

    const failed = page.getByRole('alert').filter({ hasText: "Couldn't draft the Story" });
    await expect(failed).toContainText('DeepInfra is down');
    await expect(page).toHaveURL(/\/$/);
    await failed.getByRole('button', { name: 'Retry' }).click();

    await expect(page).toHaveURL(/\/stories\/\d+$/);
    const storyUrl = page.url();
    await expect(page.getByRole('region', { name: 'Playable status' })).toContainText('Playable');
    await expect(page.getByRole('region', { name: 'Playable status' })).not.toContainText('before you can play');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    const storySection = page.getByRole('region', { name: 'Story' });
    await expect(storySection.getByLabel('Title')).toHaveValue('The Lighthouse');
    await expect(storySection.getByLabel('Setting')).toHaveValue(draft.setting);
    await expect(storySection.getByLabel('Opening')).toHaveValue(draft.opening);
    await page.getByRole('tab', { name: 'Style' }).click();
    await expect(
        page.getByRole('region', { name: 'Style' }).getByRole('radiogroup', { name: 'Point of view' }).getByRole('radio', { name: '1st person' }),
    ).toBeChecked();
    await expect(page.getByRole('region', { name: 'Style' }).getByLabel('Image style')).toHaveValue('ink wash, muted');
    await page.getByRole('tab', { name: 'Role' }).click();
    await expect(page.getByRole('region', { name: 'Role' }).getByLabel('Name')).toHaveValue('The new keeper');
    await page.getByRole('tab', { name: 'Characters' }).click();
    const mira = page.getByRole('region', { name: 'Character 1' });
    await expect(mira.getByLabel('Name', { exact: true })).toHaveValue('Mira');
    await expect(mira.getByLabel('Secrets')).toHaveValue('She put the lamp out herself.');
    await page.getByRole('tab', { name: 'Bonds' }).click();
    await expect(
        page
            .getByRole('region', { name: 'Bonds from Mira' })
            .getByRole('group', { name: 'Bond toward The new keeper (the Role)' })
            .getByLabel('Label'),
    ).toHaveValue('wary');
    await page.getByRole('tab', { name: 'Scenes' }).click();
    await expect(page.getByRole('region', { name: 'Scene 1' }).getByLabel('Name')).toHaveValue('Arrival');
    await page.getByRole('tab', { name: 'Story' }).click();

    // Both draft calls carried the idea, as story_draft calls in JSON mode.
    const calls = await (await request.get(`${FAKE}/calls`)).json();
    const drafts = calls.calls.filter(
        (call: { method: string; request?: { kind: string } }) =>
            call.method === 'completeText' && call.request?.kind === 'story_draft',
    );
    expect(drafts).toHaveLength(2);
    for (const call of drafts) {
        expect(call.request.json).toBe(true);
        expect(JSON.stringify(call.request.messages)).toContain(idea);
    }

    // Rewrite one field: a failure shows at the field with Retry, then the rewrite lands there only.
    await scriptText(request, 'field_rewrite', [
        { error: 'outage', message: 'OpenRouter: DeepInfra is down.' },
        'A lighthouse at the end of a drowned causeway, 1890s, where the fog never lifts.',
    ]);
    await storySection.getByTitle('Rewrite Setting').click();
    const rewriteFailed = storySection.getByRole('alert').filter({ hasText: "Couldn't rewrite Setting" });
    await expect(rewriteFailed).toContainText('DeepInfra is down');
    await expect(storySection.getByLabel('Setting')).toHaveValue(draft.setting);
    await rewriteFailed.getByRole('button', { name: 'Retry' }).click();

    await expect(storySection.getByLabel('Setting')).toHaveValue(
        'A lighthouse at the end of a drowned causeway, 1890s, where the fog never lifts.',
    );
    await expect(rewriteFailed).toHaveCount(0);
    await expect(storySection.getByLabel('Title')).toHaveValue('The Lighthouse');
    await expect(storySection.getByLabel('Opening')).toHaveValue(draft.opening);
    await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');
    await page.getByRole('tab', { name: 'Characters' }).click();
    await expect(mira.getByLabel('Voice')).toHaveValue('Short sentences. Never says please.');
    await page.getByRole('tab', { name: 'Story' }).click();

    // The rewrite is saved: it survives a reload, and Home shows the Story without the Draft badge.
    await page.reload();
    await expect(page.getByRole('region', { name: 'Story' }).getByLabel('Setting')).toHaveValue(/drowned causeway/);
    await page.goto('/');
    const card = page.getByRole('list', { name: 'Stories' }).getByRole('button', { name: /The Lighthouse/ });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText('Draft');

    // Leave the shared database as it was found.
    await page.goto(storyUrl);
    await page.getByRole('button', { name: 'Delete Story' }).click();
    await page.getByRole('group', { name: 'Delete this Story and everything under it?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No Stories yet.')).toBeVisible();
});

test('an invalid draft is not saved and can be retried from the same idea', async ({ page, request }) => {
    await scriptText(request, 'story_draft', [
        JSON.stringify({ ...draft, characters: [] }),
        JSON.stringify(draft),
    ]);

    const storyIds = async () =>
        ((await (await request.get('/api/stories')).json()) as { stories: { id: number }[] }).stories.map((s) => s.id);
    const before = await storyIds();

    await page.goto('/');
    await page.getByRole('button', { name: 'New Story' }).click();
    const panel = page.getByRole('region', { name: 'New Story' });
    await panel.getByLabel('Idea').fill('An empty lighthouse.');
    await panel.getByRole('button', { name: 'Draft from idea' }).click();

    const failed = page.getByRole('alert').filter({ hasText: "Couldn't draft the Story" });
    await expect(failed).toContainText('1 to 6 Characters');
    // Nothing was saved.
    expect(await storyIds()).toEqual(before);

    await failed.getByRole('button', { name: 'Retry' }).click();
    await expect(page).toHaveURL(/\/stories\/\d+$/);
    await expect(page.getByRole('region', { name: 'Playable status' })).toContainText('Playable');

    await page.getByRole('button', { name: 'Delete Story' }).click();
    await page.getByRole('group', { name: 'Delete this Story and everything under it?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No Stories yet.')).toBeVisible();
});

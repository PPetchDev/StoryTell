import { APIRequestContext, expect, Locator, test } from '@playwright/test';

// The editor is used on a phone (spec: "Phone width"): 390px wide, with touch.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

/** The fake gateway's control routes, reached through the Next.js /api proxy. */
const FAKE = '/api/testing/fake-gateway';

async function scriptText(request: APIRequestContext, kind: string, replies: unknown[]) {
    const response = await request.post(`${FAKE}/text`, { data: { kind, replies } });
    expect(response.status()).toBe(204);
}

const SETTING = 'A lighthouse on a storm-cut island, 1890s.';
const VOICE = 'Short sentences. Never says please.';

/** A Story written through the API: Mira and Tomas, one Scene. */
async function createStory(request: APIRequestContext): Promise<{ id: number }> {
    const created = await request.post('/api/stories', {
        data: { title: 'The Lighthouse', setting: SETTING, opening: 'The lamp went out an hour ago.' },
    });
    expect(created.status()).toBe(201);
    const story = (await created.json()) as { id: number };
    await request.patch(`/api/stories/${story.id}/role`, { data: { name: 'The new keeper', description: 'Arrived this morning.' } });
    for (const name of ['Mira', 'Tomas']) {
        const added = await request.post(`/api/stories/${story.id}/characters`, {
            data: { name, appearance: `${name} looks tired.`, personality: `${name} is guarded.`, voice: name === 'Mira' ? VOICE : 'Rambles.' },
        });
        expect(added.status()).toBe(201);
    }
    await request.post(`/api/stories/${story.id}/scenes`, { data: { name: 'Arrival', situation: 'Reach the lamp room.' } });
    return story;
}

test.afterEach(async ({ request }) => {
    await request.delete(FAKE);
});

/** The field is on screen, below the sticky header and tabs, and clear of the sheet. */
async function expectAboveSheet(field: Locator, sheet: Locator, tabs: Locator) {
    await expect(field).toBeInViewport();
    await expect
        .poll(async () => {
            const [box, sheetBox, tabsBox] = await Promise.all([field.boundingBox(), sheet.boundingBox(), tabs.boundingBox()]);
            if (!box || !sheetBox || !tabsBox) return 'not laid out';
            if (box.y < tabsBox.y + tabsBox.height) return 'under the tabs';
            if (box.y + box.height > sheetBox.y) return 'under the sheet';
            return 'above the sheet';
        })
        .toBe('above the sheet');
}

test('a change to a Character lands on the Characters tab, above the sheet and lit; its link goes back to it', async ({
    page,
    request,
}) => {
    const story = await createStory(request);
    const secret = 'Tomas keeps the lamp-room key on a cord under his shirt.';
    await scriptText(request, 'story_assistant', [
        JSON.stringify({
            reply: 'Tomas has a secret now.',
            changes: [{ op: 'set', target: 'character', name: 'Tomas', field: 'secrets', value: secret }],
        }),
    ]);
    try {
        await page.goto(`/stories/${story.id}`);
        const tabs = page.getByRole('tablist', { name: 'Story sections' });
        await expect(page.getByRole('tab', { name: 'Story', exact: true })).toHaveAttribute('aria-selected', 'true');

        await page.getByRole('button', { name: 'Assistant' }).click();
        const sheet = page.getByRole('dialog', { name: 'Assistant' });
        await expect(sheet).toBeVisible();
        // A half-height sheet: the editor stays in sight, and in use, above it.
        const sheetBox = await sheet.boundingBox();
        expect(sheetBox!.height).toBeGreaterThan(844 * 0.4);
        expect(sheetBox!.height).toBeLessThan(844 * 0.6);
        await page.getByRole('region', { name: 'Story' }).getByLabel('Title').fill('The Lighthouse at Night');
        await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');

        await sheet.getByLabel('Instruction').fill('Give Tomas a secret.');
        await sheet.getByRole('button', { name: 'Send' }).click();

        // The editor switches to the changed field's tab and shows it, lit, above the sheet.
        await expect(page.getByRole('tab', { name: 'Characters', exact: true })).toHaveAttribute('aria-selected', 'true');
        const tomas = page.getByRole('region', { name: 'Character 2' });
        const secrets = tomas.getByLabel('Secrets');
        await expect(secrets).toHaveValue(secret);
        await expect(tomas.getByText('changed by the assistant')).toBeVisible();
        await expectAboveSheet(secrets, sheet, tabs);

        // After moving away, the change's link in the transcript goes back to the field.
        await page.getByRole('tab', { name: 'Story', exact: true }).click();
        await expect(secrets).toHaveCount(0);
        const change = sheet.getByRole('list', { name: 'Changes' }).getByRole('listitem');
        await change.getByRole('button', { name: 'Tomas: Secrets' }).click();
        await expect(page.getByRole('tab', { name: 'Characters', exact: true })).toHaveAttribute('aria-selected', 'true');
        await expect(secrets).toBeFocused();
        await expectAboveSheet(secrets, sheet, tabs);

        // Undo still reverts it.
        await change.getByRole('button', { name: 'Undo' }).click();
        await expect(secrets).toHaveValue('');
        await expect(change).toContainText('Undone');
        await expect(tomas.getByText('changed by the assistant')).toHaveCount(0);
    } finally {
        await request.delete(`/api/stories/${story.id}`);
    }
});

test('an instruction changes fields, lit up with Undo; a removal asks first; reopening starts fresh', async ({ page, request }) => {
    const story = await createStory(request);
    await scriptText(request, 'story_assistant', [
        // The first try fails at the provider; Retry sends the same instruction again.
        { error: 'outage', message: 'OpenRouter: DeepInfra is down.' },
        JSON.stringify({
            reply: 'The island is drowned now, and Mira is drier.',
            changes: [
                { op: 'set', target: 'story', field: 'setting', value: 'A lighthouse at the end of a drowned causeway, 1890s.' },
                { op: 'set', target: 'character', name: 'Mira', field: 'voice', value: 'Clipped. Drops the subject when it hurts.' },
                { op: 'add', target: 'scene', value: { name: 'The lamp', situation: 'Light it before the ship rounds the point.' } },
            ],
        }),
    ]);

    await page.goto(`/stories/${story.id}`);
    await page.getByRole('button', { name: 'Assistant' }).click();
    const assistant = page.getByRole('dialog', { name: 'Assistant' });
    await expect(assistant.getByRole('list', { name: 'Conversation' }).getByRole('listitem')).toHaveCount(0);
    const instruction = 'Make the island feel more drowned and Mira drier.';
    await assistant.getByLabel('Instruction').fill(instruction);
    await assistant.getByRole('button', { name: 'Send' }).click();

    const failed = assistant.getByRole('alert').filter({ hasText: "Couldn't apply" });
    await expect(failed).toContainText('DeepInfra is down');
    await failed.getByRole('button', { name: 'Retry' }).click();

    // The changes landed in the editor, each field marked, and the answer lists them with Undo.
    // The editor shows the first one, the Setting, on the Story tab; each change links to its field.
    const marked = 'changed by the assistant';
    const storySection = page.getByRole('region', { name: 'Story' });
    const mira = page.getByRole('region', { name: 'Character 1' });
    await expect(storySection.getByLabel('Setting')).toHaveValue('A lighthouse at the end of a drowned causeway, 1890s.');
    await expect(storySection.getByLabel('Title')).toHaveValue('The Lighthouse');
    await expect(storySection.getByText(marked)).toHaveCount(1);
    await expect(assistant).toContainText('The island is drowned now, and Mira is drier.');
    const changes = assistant.getByRole('list', { name: 'Changes' }).getByRole('listitem');
    await expect(changes).toHaveText([/Setting/, /Mira: Voice/, /Added Scene The lamp/]);
    const link = (name: string) => changes.getByRole('button', { name, exact: true });
    await link('Mira: Voice').click();
    await expect(mira.getByLabel('Voice')).toHaveValue('Clipped. Drops the subject when it hurts.');
    await expect(mira.getByLabel('Voice')).toBeFocused();
    await expect(page.getByRole('region', { name: 'Character 2' }).getByLabel('Voice')).toHaveValue('Rambles.');
    await expect(mira.getByText(marked)).toHaveCount(1);
    await link('Added Scene The lamp').click();
    const scene2 = page.getByRole('region', { name: 'Scene 2' });
    await expect(scene2.getByLabel('Name')).toBeFocused();
    await expect(scene2.getByLabel('Name')).toHaveValue('The lamp');
    await expect(scene2.getByText(marked)).toHaveCount(3);
    await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');

    // Both calls carried the instruction and the Story, as story_assistant calls in JSON mode.
    const calls = await (await request.get(`${FAKE}/calls`)).json();
    const sent = calls.calls.filter(
        (call: { method: string; request?: { kind: string } }) => call.method === 'completeText' && call.request?.kind === 'story_assistant',
    );
    expect(sent).toHaveLength(2);
    for (const call of sent) {
        expect(call.request.json).toBe(true);
        expect(JSON.stringify(call.request.messages)).toContain(instruction);
        expect(JSON.stringify(call.request.messages)).toContain(SETTING);
    }

    // Undo the Setting: the old value is back, its mark gone, the others still lit.
    await link('Setting').click();
    await changes.filter({ hasText: 'Setting' }).getByRole('button', { name: 'Undo' }).click();
    await expect(storySection.getByLabel('Setting')).toHaveValue(SETTING);
    await expect(changes.filter({ hasText: 'Setting' })).toContainText('Undone');
    await expect(storySection.getByText(marked)).toHaveCount(0);
    await link('Mira: Voice').click();
    await expect(mira.getByText(marked)).toHaveCount(1);
    await changes.filter({ hasText: 'Mira: Voice' }).getByRole('button', { name: 'Undo' }).click();
    await expect(mira.getByLabel('Voice')).toHaveValue(VOICE);
    await expect(mira.getByText(marked)).toHaveCount(0);
    // Undo of an added Scene removes it again, after asking; it is no longer a link then.
    await link('Added Scene The lamp').click();
    await changes.filter({ hasText: 'Added Scene' }).getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('group', { name: 'Remove Scene The lamp again?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(scene2).toHaveCount(0);
    await expect(link('Added Scene The lamp')).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');

    // The undos are saved: a reload shows the old values.
    await page.reload();
    await expect(page.getByRole('region', { name: 'Scene 1' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Scene 2' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Story' }).click();
    await expect(page.getByRole('region', { name: 'Story' }).getByLabel('Setting')).toHaveValue(SETTING);
    await page.getByRole('tab', { name: 'Characters' }).click();
    await expect(page.getByRole('region', { name: 'Character 1' }).getByLabel('Voice')).toHaveValue(VOICE);

    // A removal is not applied until confirmed; Cancel keeps Tomas, Apply removes him for good.
    await scriptText(request, 'story_assistant', [
        JSON.stringify({ reply: 'Tomas is gone.', changes: [{ op: 'remove', target: 'character', name: 'Tomas' }] }),
        JSON.stringify({ reply: 'Tomas is gone.', changes: [{ op: 'remove', target: 'character', name: 'Tomas' }] }),
    ]);
    await page.getByRole('button', { name: 'Assistant' }).click();
    const reopened = page.getByRole('dialog', { name: 'Assistant' });
    await expect(reopened.getByRole('list', { name: 'Conversation' }).getByRole('listitem')).toHaveCount(0);
    await reopened.getByLabel('Instruction').fill('Remove Tomas.');
    await reopened.getByRole('button', { name: 'Send' }).click();
    const confirmRemovals = reopened.getByRole('group', { name: 'Confirm removals' });
    await expect(confirmRemovals).toContainText('This would remove Character Tomas');
    await expect(page.getByRole('region', { name: 'Character 2' }).getByLabel('Name', { exact: true })).toHaveValue('Tomas');
    await confirmRemovals.getByRole('button', { name: 'Cancel' }).click();
    await expect(reopened).toContainText('Not applied.');
    await expect(page.getByRole('region', { name: 'Character 2' })).toHaveCount(1);

    await reopened.getByLabel('Instruction').fill('Remove Tomas.');
    await reopened.getByRole('button', { name: 'Send' }).click();
    await reopened.getByRole('group', { name: 'Confirm removals' }).getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('region', { name: 'Character 2' })).toHaveCount(0);
    const removal = reopened.getByRole('list', { name: 'Changes' }).getByRole('listitem').filter({ hasText: 'Removed Character Tomas' });
    await expect(removal).toContainText("Can't be undone");
    // Confirming applied the set the API already had: two instructions, two calls, nothing more.
    const after = await (await request.get(`${FAKE}/calls`)).json();
    expect(after.pendingReplies).toEqual({});
    const sentAfter = after.calls.filter(
        (call: { method: string; request?: { kind: string } }) => call.method === 'completeText' && call.request?.kind === 'story_assistant',
    );
    expect(sentAfter).toHaveLength(sent.length + 2);

    // Closing and reopening shows no previous conversation.
    await reopened.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog', { name: 'Assistant' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Assistant' }).click();
    await expect(page.getByRole('dialog', { name: 'Assistant' }).getByRole('list', { name: 'Conversation' }).getByRole('listitem')).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Assistant' })).not.toContainText('Tomas');

    // Leave the shared database as it was found.
    await page.getByRole('tab', { name: 'Story' }).click();
    await page.getByRole('button', { name: 'Delete Story' }).click();
    await page.getByRole('group', { name: 'Delete this Story and everything under it?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No Stories yet.')).toBeVisible();
});

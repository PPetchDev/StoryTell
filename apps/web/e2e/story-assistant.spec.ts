import { APIRequestContext, expect, test } from '@playwright/test';

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
    const assistant = page.getByRole('complementary', { name: 'Assistant' });
    await expect(assistant.getByRole('list', { name: 'Conversation' }).getByRole('listitem')).toHaveCount(0);
    const instruction = 'Make the island feel more drowned and Mira drier.';
    await assistant.getByLabel('Instruction').fill(instruction);
    await assistant.getByRole('button', { name: 'Send' }).click();

    const failed = assistant.getByRole('alert').filter({ hasText: "Couldn't apply" });
    await expect(failed).toContainText('DeepInfra is down');
    await failed.getByRole('button', { name: 'Retry' }).click();

    // The changes landed in the form, each field marked, and the answer lists them with Undo.
    const storySection = page.getByRole('region', { name: 'Story' });
    const mira = page.getByRole('region', { name: 'Character 1' });
    await expect(storySection.getByLabel('Setting')).toHaveValue('A lighthouse at the end of a drowned causeway, 1890s.');
    await expect(mira.getByLabel('Voice')).toHaveValue('Clipped. Drops the subject when it hurts.');
    await expect(storySection.getByLabel('Title')).toHaveValue('The Lighthouse');
    await expect(page.getByRole('region', { name: 'Character 2' }).getByLabel('Voice')).toHaveValue('Rambles.');
    await expect(storySection.locator('.field-changed')).toHaveCount(1);
    await expect(storySection.locator('.field-changed')).toContainText('changed by the assistant');
    await expect(mira.locator('.field-changed')).toHaveCount(1);
    const scene2 = page.getByRole('region', { name: 'Scene 2' });
    await expect(scene2.getByLabel('Name')).toHaveValue('The lamp');
    await expect(scene2.locator('.field-changed')).toHaveCount(3);
    await expect(assistant).toContainText('The island is drowned now, and Mira is drier.');
    const changes = assistant.getByRole('list', { name: 'Changes' }).getByRole('listitem');
    await expect(changes).toHaveText([/Setting/, /Mira: Voice/, /Added Scene The lamp/]);
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
    await changes.filter({ hasText: 'Setting' }).getByRole('button', { name: 'Undo' }).click();
    await expect(storySection.getByLabel('Setting')).toHaveValue(SETTING);
    await expect(changes.filter({ hasText: 'Setting' })).toContainText('Undone');
    await expect(storySection.locator('.field-changed')).toHaveCount(0);
    await expect(mira.locator('.field-changed')).toHaveCount(1);
    await changes.filter({ hasText: 'Mira: Voice' }).getByRole('button', { name: 'Undo' }).click();
    await expect(mira.getByLabel('Voice')).toHaveValue(VOICE);
    await expect(mira.locator('.field-changed')).toHaveCount(0);
    // Undo of an added Scene removes it again, after asking.
    await changes.filter({ hasText: 'Added Scene' }).getByRole('button', { name: 'Undo' }).click();
    await page.getByRole('group', { name: 'Remove Scene The lamp again?' }).getByRole('button', { name: 'Remove' }).click();
    await expect(scene2).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /Saved|Saving/ })).toHaveText('Saved');

    // The undos are saved: a reload shows the old values.
    await page.reload();
    await expect(page.getByRole('region', { name: 'Story' }).getByLabel('Setting')).toHaveValue(SETTING);
    await expect(page.getByRole('region', { name: 'Character 1' }).getByLabel('Voice')).toHaveValue(VOICE);
    await expect(page.getByRole('region', { name: 'Scene 2' })).toHaveCount(0);

    // A removal is not applied until confirmed; Cancel keeps Tomas, Apply removes him for good.
    await scriptText(request, 'story_assistant', [
        JSON.stringify({ reply: 'Tomas is gone.', changes: [{ op: 'remove', target: 'character', name: 'Tomas' }] }),
        JSON.stringify({ reply: 'Tomas is gone.', changes: [{ op: 'remove', target: 'character', name: 'Tomas' }] }),
    ]);
    await page.getByRole('button', { name: 'Assistant' }).click();
    const reopened = page.getByRole('complementary', { name: 'Assistant' });
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
    await expect(page.getByRole('complementary', { name: 'Assistant' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Assistant' }).click();
    await expect(page.getByRole('complementary', { name: 'Assistant' }).getByRole('list', { name: 'Conversation' }).getByRole('listitem')).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Assistant' })).not.toContainText('Tomas');

    // Leave the shared database as it was found.
    await page.getByRole('button', { name: 'Delete Story' }).click();
    await page.getByRole('group', { name: 'Delete this Story and everything under it?' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('No Stories yet.')).toBeVisible();
});

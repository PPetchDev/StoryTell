import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// The Visual novel view (.scratch/chat-looks/spec.md, "Visual novel view"), on a phone: 390px wide,
// with touch. The desktop test widens to a PC.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const FAKE = '/api/testing/fake-gateway';
const NO_OPS = '{"operations":[]}';

/** One long paragraph, so the Opening fills the screen in the thread. */
const OPENING_NARRATION = Array.from({ length: 12 }, (_, n) => `The storm leans on the lighthouse, wave ${n + 1} after wave.`).join(' ');
const OPENING = `${OPENING_NARRATION}\n\n@Mira: Boots off, keeper.`;

/** A reply with two narration paragraphs, Mira twice (the first line tagged joy) and Kai. */
const REPLY = [
    'The wind drops all at once.',
    'Somewhere above, the lamp room door creaks open on its own.',
    '@Mira: *She smiles.* Come up, then.',
    '@Mira: Mind the third step.',
    '@Kai: Hush, both of you.',
].join('\n\n');

const JUDGE_JOY = JSON.stringify({
    bond_changes: [],
    arc_steps: [],
    scene: { move_on: false, reason: 'not yet' },
    expressions: [
        { line: 1, emotion: 'joy' },
        { line: 2, emotion: 'neutral' },
        { line: 3, emotion: 'neutral' },
    ],
});

const madeStories: number[] = [];

test.afterEach(async ({ page, request }) => {
    while (madeStories.length > 0) await request.delete(`/api/stories/${madeStories.pop()}`);
    await request.delete(FAKE);
    // The view is a per-device choice: leave it as the other files expect.
    await page.evaluate(() => localStorage.removeItem('storytell.chatView')).catch(() => {});
});

/** A small PNG drawn by the browser, in one colour. */
async function picture(page: Page, colour: string): Promise<Buffer> {
    const dataUrl = await page.evaluate((fill) => {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 300;
        const context = canvas.getContext('2d')!;
        context.fillStyle = fill;
        context.fillRect(0, 0, 200, 300);
        return canvas.toDataURL('image/png');
    }, colour);
    return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/**
 * A Story with Mira (a Reference image and a Happy Expression) and Kai (no picture), and a Chat whose
 * one reply is REPLY, judged with Mira's first line as joy. Answers once the judge is done.
 */
async function storyWithReply(page: Page, request: APIRequestContext, rules: { find: string; replace: string }[] = []) {
    await page.goto('/settings');
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    const storyId = (await created.json()).id as number;
    madeStories.push(storyId);
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    const ids: Record<string, number> = {};
    for (const name of ['Mira', 'Kai']) {
        const made = await request.post(`/api/stories/${storyId}/characters`, {
            data: { name, appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        ids[name] = ((await made.json()).characters as { id: number; name: string }[]).find((each) => each.name === name)!.id;
    }
    await request.post(`${FAKE}/image`, { data: { kind: 'reference_image', replies: [{}, {}, {}, {}] } });
    const round = await (await request.post(`/api/stories/${storyId}/characters/${ids.Mira}/reference-image/candidates`)).json();
    const picked = await request.put(`/api/stories/${storyId}/characters/${ids.Mira}/reference-image`, { data: { candidateId: round.candidates[0].id } });
    expect(picked.ok()).toBe(true);
    const happy = await request.put(`/api/stories/${storyId}/characters/${ids.Mira}/expressions/joy`, {
        multipart: { image: { name: 'happy.png', mimeType: 'image/png', buffer: await picture(page, '#ffc46b') } },
    });
    expect(happy.ok()).toBe(true);
    for (const rule of rules) await request.post(`/api/stories/${storyId}/replace-rules`, { data: rule });

    await request.post(`${FAKE}/text`, { data: { kind: 'turn', replies: [{ text: REPLY, model: 'glm-5.3' }] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: [JUDGE_JOY] } });
    await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
    const sent = await request.post(`/api/stories/${storyId}/chats/${chatId}/messages`, { data: { text: 'Where is the lamp room?' } });
    expect(sent.ok()).toBe(true);
    await expect
        .poll(async () => {
            const chat = await (await request.get(`/api/stories/${storyId}/chats/${chatId}`)).json();
            return chat.messages.at(-1).judge?.status;
        })
        .toBe('done');
    return { storyId, chatId };
}

/** The Visual novel view, its stage, its box, and what the box shows. */
function view(page: Page) {
    const root = page.getByRole('region', { name: 'Visual novel view' });
    const box = root.getByRole('region', { name: 'Shown line' });
    return {
        root,
        box,
        speaker: box.locator('[data-speaker]'),
        text: box.locator('[data-line]'),
        picture: root.locator('[data-stage-picture]'),
        next: root.getByRole('button', { name: 'Next', exact: true }),
        back: root.getByRole('button', { name: 'Back', exact: true }),
    };
}

async function toggle(page: Page): Promise<Locator> {
    const button = page.getByRole('button', { name: 'Visual novel view' });
    await button.click();
    return button;
}

test.describe('stored Messages', () => {
    test('the toggle is remembered on this device; the view opens on the newest reply and steps narration, speaker A, speaker B, with Back and the keys', async ({
        page,
        request,
    }) => {
        const { storyId, chatId } = await storyWithReply(page, request);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Hush, both of you.');
        const button = page.getByRole('button', { name: 'Visual novel view' });
        await expect(button).toHaveAttribute('aria-pressed', 'false');
        await expect(view(page).root).toHaveCount(0);

        await toggle(page);
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(page.getByRole('region', { name: 'Messages' })).toHaveCount(0);
        const vn = view(page);
        // The box is announced as it changes.
        await expect(vn.box).toHaveAttribute('aria-live', 'polite');

        // The newest reply's first part: narration, in the box with no picture and no name.
        await expect(vn.text).toHaveText('The wind drops all at once.');
        await expect(vn.speaker).toHaveCount(0);
        await expect(vn.picture).toHaveCount(0);
        // The composer stays under the stage.
        await expect(page.getByRole('form', { name: 'Composer' })).toBeVisible();

        // A tap anywhere on the stage goes on: long narration steps per paragraph.
        await vn.root.locator('[data-stage]').click({ position: { x: 40, y: 40 } });
        await expect(vn.text).toHaveText('Somewhere above, the lamp room door creaks open on its own.');

        // Speaker A on the Next button: Mira's Happy Expression for the joy line, large, her name in her colour.
        await vn.next.click();
        await expect(vn.speaker).toHaveText('Mira');
        await expect(vn.speaker).toHaveCSS('color', 'rgb(242, 183, 102)');
        await expect(vn.text).toHaveText('She smiles. Come up, then.');
        await expect(vn.text.locator('em')).toHaveText('She smiles.');
        await expect(vn.picture).toHaveAttribute('src', /\/api\/images\/expressions\/story-\d+\/character-\d+-joy-/);
        await expect(vn.picture).toHaveAttribute('alt', 'Mira');
        await expect(vn.picture).toHaveCSS('object-fit', 'contain');

        // Her untagged-as-joy line: the whole Reference image. Space steps too.
        await vn.root.locator('[data-stage]').focus();
        await page.keyboard.press('Space');
        await expect(vn.text).toHaveText('Mind the third step.');
        await expect(vn.picture).toHaveAttribute('src', /\/api\/images\/reference-images\//);

        // Speaker B has no picture: a large initial on his colour. → steps.
        await page.keyboard.press('ArrowRight');
        await expect(vn.speaker).toHaveText('Kai');
        await expect(vn.picture).toHaveAccessibleName('Kai');
        await expect(vn.picture).toHaveText('K');
        await expect(vn.picture).toHaveCSS('background-color', 'rgb(95, 208, 197)');

        // At the last step Next does nothing more.
        await page.keyboard.press('Enter');
        await expect(vn.speaker).toHaveText('Kai');

        // Back, and ←, step back across Messages: to the user's own line, under the name worn.
        await vn.back.click();
        await expect(vn.text).toHaveText('Mind the third step.');
        await vn.root.locator('[data-stage]').focus();
        for (let n = 0; n < 4; n++) await page.keyboard.press("ArrowLeft");
        await expect(vn.speaker).toHaveText('Ash');
        await expect(vn.text).toHaveText('Where is the lamp room?');
        await expect(vn.picture).toHaveCount(0);

        // Remembered on this device, for every Chat.
        await page.reload();
        await expect(view(page).text).toHaveText('The wind drops all at once.');
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await page.goto(`/stories/${storyId}/chats`);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await expect(view(page).root).toBeVisible();

        // Off again: the thread, as it was.
        await toggle(page);
        await expect(page.getByRole('article', { name: 'AI reply' })).toContainText('Hush, both of you.');
        await expect(view(page).root).toHaveCount(0);
    });

    test('a tap on the large picture opens the Character profile, and the menu and Memory drawer work from the view', async ({ page, request }) => {
        const { storyId, chatId } = await storyWithReply(page, request);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await toggle(page);
        const vn = view(page);
        await vn.next.click();
        await vn.next.click();
        await expect(vn.speaker).toHaveText('Mira');
        await vn.root.getByRole('button', { name: 'Profile of Mira' }).click();
        await expect(page.getByRole('dialog', { name: 'Mira' })).toBeVisible();
        // The tap opened the profile; it did not step.
        await page.keyboard.press('Escape');
        await expect(vn.text).toHaveText('She smiles. Come up, then.');

        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
        await expect(page.getByRole('complementary', { name: 'Memory' })).toBeVisible();
    });

    test("an On AI Messages Replace rule shows its words in the box, and one that removes a narration paragraph removes that step", async ({
        page,
        request,
    }) => {
        const { storyId, chatId } = await storyWithReply(page, request, [
            { find: 'Somewhere above, the lamp room door creaks open on its own.', replace: '' },
            { find: 'third step', replace: 'loose board' },
            // Names are never touched.
            { find: 'Kai', replace: 'Kaito' },
        ]);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await toggle(page);
        const vn = view(page);
        await expect(vn.text).toHaveText('The wind drops all at once.');
        await vn.next.click();
        await expect(vn.text).toHaveText('She smiles. Come up, then.');
        await vn.next.click();
        await expect(vn.text).toHaveText('Mind the loose board.');
        await vn.next.click();
        await expect(vn.speaker).toHaveText('Kai');
    });

    test('a Snapshot is its own step after its Message, filling the stage, and Open shows the viewer', async ({ page, request }) => {
        const { storyId, chatId } = await storyWithReply(page, request);
        await request.post(`${FAKE}/text`, {
            data: { kind: 'snapshot_prompt', replies: [JSON.stringify({ in_frame: ['Mira'], scene: 'Mira on the stairs.' })] },
        });
        await request.post(`${FAKE}/image`, { data: { kind: 'snapshot_image', replies: [{}] } });
        expect((await request.post(`/api/stories/${storyId}/chats/${chatId}/snapshots`, { data: { hint: '' } })).status()).toBe(202);
        await expect.poll(async () => (await (await request.get(`/api/stories/${storyId}/gallery`)).json()).snapshots.length).toBe(1);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await toggle(page);
        const vn = view(page);
        for (let n = 0; n < 4; n++) await vn.next.click();
        await expect(vn.speaker).toHaveText('Kai');
        await vn.next.click();
        // The Snapshot fills the stage, with no box.
        const shot = vn.root.getByRole('img', { name: 'Snapshot with Mira' });
        await expect(shot).toBeVisible();
        await expect(shot).toHaveCSS('object-fit', 'contain');
        await expect(vn.box).toHaveCount(0);
        await vn.root.getByRole('button', { name: 'Open', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Snapshot' })).toBeVisible();
        await page.getByRole('dialog', { name: 'Snapshot' }).getByRole('button', { name: 'Close' }).click();
        await vn.back.click();
        await expect(vn.speaker).toHaveText('Kai');
    });

    test('switching to the thread scrolls to the Message on show', async ({ page, request }) => {
        const { storyId, chatId } = await storyWithReply(page, request);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await toggle(page);
        const vn = view(page);
        await expect(vn.text).toHaveText('The wind drops all at once.');
        // Back to the Opening's narration.
        for (let n = 0; n < 3; n++) await vn.back.click();
        await expect(vn.text).toContainText('The storm leans on the lighthouse, wave 1');

        await toggle(page);
        const opening = page.getByRole('article', { name: 'Opening' });
        await expect(opening).toBeVisible();
        await expect
            .poll(async () => {
                const box = await opening.boundingBox();
                const thread = await page.getByRole('region', { name: 'Messages' }).boundingBox();
                // The Opening is where the thread opens, across its middle: not the end, where it opens by default.
                const middle = thread === null ? 0 : thread.y + thread.height / 2;
                return box !== null && box.y <= middle && box.y + box.height >= middle;
            })
            .toBe(true);
    });
});

test.describe('on a PC', () => {
    test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });

    test('the stage sits in the reading column over the Backdrop, and the docked Memory drawer leaves it usable', async ({ page, request }) => {
        const { storyId, chatId } = await storyWithReply(page, request);
        const cover = await request.put(`/api/stories/${storyId}/cover`, { data: { characterId: (await (await request.get(`/api/stories/${storyId}`)).json()).characters[0].id } });
        expect(cover.ok()).toBe(true);
        await request.patch(`/api/stories/${storyId}`, { data: { backdrop: 'cover' } });
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await toggle(page);
        const vn = view(page);
        await expect(vn.text).toHaveText('The wind drops all at once.');
        await expect(page.locator('[data-backdrop] img')).toBeVisible();

        const stage = (await vn.root.locator('[data-stage]').boundingBox())!;
        expect(stage.width).toBeLessThanOrEqual(768);
        const rail = 104;
        expect(Math.abs(stage.x + stage.width / 2 - (rail + (1440 - rail) / 2))).toBeLessThan(2);

        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Memory/ }).click();
        const drawer = page.getByRole('complementary', { name: 'Memory' });
        await expect(drawer).toBeVisible();
        const narrowed = (await vn.root.locator('[data-stage]').boundingBox())!;
        const drawerBox = (await drawer.boundingBox())!;
        expect(narrowed.x + narrowed.width).toBeLessThanOrEqual(drawerBox.x + 1);
        await vn.next.click();
        await expect(vn.text).toHaveText('Somewhere above, the lamp room door creaks open on its own.');
        await vn.next.click();
        // The picture can be taller on a PC: up to about 70% of the stage.
        await expect(vn.picture).toBeVisible();
    });
});

test.describe('while playing', () => {
    const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
    const STREAMED = 'Rain lashes the gallery glass.\n\n@Mira: You took your time, keeper. Boots off, and mind the oil.\n\nShe slides the logbook across.';

    /** A playable Story with Mira, and a Chat on its Opening, in the Visual novel view. */
    async function playableChat(page: Page, request: APIRequestContext) {
        const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
        const storyId = (await created.json()).id as number;
        madeStories.push(storyId);
        await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse, 1890s.', opening: 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.' } });
        await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
        await request.post(`/api/stories/${storyId}/characters`, {
            data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        await request.delete(FAKE);
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await toggle(page);
        await expect(view(page).text).toHaveText('The lamp went out an hour ago.');
        return { storyId, chatId };
    }

    /** Scripts turn replies, each with a judge and an extraction that change nothing. */
    async function scriptTurns(request: APIRequestContext, ...replies: object[]) {
        await request.post(`${FAKE}/text`, { data: { kind: 'turn', replies } });
        await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: replies.map(() => NO_CHANGE) } });
        await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: replies.map(() => NO_OPS) } });
    }

    const composer = (page: Page) => page.getByRole('form', { name: 'Composer' });

    test('a send shows the line, then the reply as it streams; Next past what has arrived shows the writing dots, then the next part; the place holds as it settles', async ({
        page,
        request,
    }) => {
        await playableChat(page, request);
        // Written slowly: a few letters every quarter second.
        await scriptTurns(request, { text: STREAMED, model: 'glm-5.3', pieceSize: 4, pieceDelayMs: 250 });
        const vn = view(page);

        await composer(page).getByRole('textbox', { name: 'Write as Ash' }).fill('*I shake off the rain.* Evening.');
        await composer(page).getByRole('button', { name: 'Send' }).click();
        // The line goes up at once, under the name worn.
        await expect(vn.speaker).toHaveText('Ash');
        await expect(vn.text).toHaveText('I shake off the rain. Evening.');
        // Then, once, to the reply's first part as it is written.
        await expect(vn.text).toContainText('Rain');
        await expect(vn.speaker).toHaveCount(0);

        // Past what has arrived: the writing dots, until Mira's line comes.
        await vn.next.click();
        await expect(vn.box.getByRole('status')).toContainText('Writing');
        await expect(vn.speaker).toHaveText('Mira');
        await expect(vn.text).toContainText('You took');

        // The turn settles into the stored Message, and the view stays on Mira's line.
        await expect(composer(page).getByRole('button', { name: 'Stop' })).toHaveCount(0, { timeout: 30_000 });
        await expect(vn.speaker).toHaveText('Mira');
        await expect(vn.text).toHaveText('You took your time, keeper. Boots off, and mind the oil.');
        await vn.next.click();
        await expect(vn.text).toHaveText('She slides the logbook across.');
    });

    test("Continue moves to the new reply; on the newest reply's last step Again shows the new reply from its start, and the versions the first", async ({
        page,
        request,
    }) => {
        await playableChat(page, request);
        await scriptTurns(
            request,
            { text: 'The wind drops.\n\n@Mira: Up, then.', model: 'glm-5.3' },
            { text: 'Thunder rolls.\n\n@Mira: Faster.', model: 'glm-5.3' },
        );
        const vn = view(page);

        await composer(page).getByRole('button', { name: 'Continue' }).click();
        await expect(vn.text).toHaveText('The wind drops.');
        await expect(composer(page).getByRole('button', { name: 'Stop' })).toHaveCount(0);

        // The action row is on the reply's last step only.
        const actions = vn.root.getByRole('group', { name: 'Message actions' });
        await expect(actions).toHaveCount(0);
        await vn.next.click();
        await expect(vn.text).toHaveText('Up, then.');
        await expect(actions.getByRole('button', { name: 'Snapshot' })).toBeVisible();
        await expect(actions.getByRole('button', { name: 'Edit in thread' })).toBeVisible();

        await actions.getByRole('button', { name: 'Again' }).click();
        await expect(vn.text).toHaveText('Thunder rolls.');
        await vn.next.click();
        await expect(vn.text).toHaveText('Faster.');
        await expect(actions.getByRole('group', { name: 'Reply versions' })).toContainText('2/2');

        await actions.getByRole('button', { name: 'Previous version' }).click();
        await expect(vn.text).toHaveText('The wind drops.');
        await vn.next.click();
        await expect(actions.getByRole('group', { name: 'Reply versions' })).toContainText('1/2');
    });

    test("Edit in thread opens that Message's Edit in the thread; Reset shows the Opening's first step", async ({ page, request }) => {
        await playableChat(page, request);
        await scriptTurns(request, { text: 'The wind drops.\n\n@Mira: Up, then.', model: 'glm-5.3' });
        const vn = view(page);
        await composer(page).getByRole('button', { name: 'Continue' }).click();
        await expect(vn.text).toHaveText('The wind drops.');
        await expect(composer(page).getByRole('button', { name: 'Stop' })).toHaveCount(0);
        await vn.next.click();

        await vn.root.getByRole('group', { name: 'Message actions' }).getByRole('button', { name: 'Edit in thread' }).click();
        const edit = page.getByRole('form', { name: 'Edit AI reply' });
        await expect(edit).toBeVisible();
        await expect(edit.getByRole('textbox', { name: 'Message text' })).toHaveValue(/The wind drops\./);
        await expect(vn.root).toHaveCount(0);
        await edit.getByRole('button', { name: 'Cancel' }).click();

        await toggle(page);
        await expect(vn.text).toHaveText('The wind drops.');
        await page.getByRole('button', { name: 'Chat menu' }).click();
        await page.getByRole('dialog', { name: 'Chat menu' }).getByRole('button', { name: /^Reset/ }).click();
        await page.getByRole('alertdialog', { name: /start this Chat over/ }).getByRole('button', { name: 'Reset' }).click();
        await expect(vn.text).toHaveText('The lamp went out an hour ago.');
        await expect(vn.back).toBeDisabled();
    });

    test('a Snapshot taken from the box shows the Drawing a Snapshot chip, then comes up as its own step', async ({ page, request }) => {
        await playableChat(page, request);
        await request.post(`${FAKE}/text`, {
            data: { kind: 'snapshot_prompt', replies: [JSON.stringify({ in_frame: ['Mira'], scene: 'Mira by the lamp.' })] },
        });
        await request.post(`${FAKE}/image`, { data: { kind: 'snapshot_image', replies: [{ delayMs: 1_500 }] } });
        const vn = view(page);
        await vn.next.click();
        await expect(vn.speaker).toHaveText('Mira');

        await vn.root.getByRole('group', { name: 'Message actions' }).getByRole('button', { name: 'Snapshot' }).click();
        await page.getByRole('dialog', { name: 'Take a Snapshot' }).getByRole('button', { name: 'Take Snapshot' }).click();
        const chip = vn.root.getByRole('status').filter({ hasText: 'Drawing a Snapshot' });
        await expect(chip).toBeVisible();
        await expect(vn.root.getByRole('img', { name: 'Snapshot with Mira' })).toBeVisible({ timeout: 15_000 });
        await expect(chip).toHaveCount(0);
    });
});

test.describe('with Read aloud', () => {
    /** Silent MPEG frames: about 26 ms each. */
    function silentMp3Base64(seconds: number): string {
        const frame = Buffer.alloc(104);
        frame.set([0xff, 0xfb, 0x10, 0xc0]);
        return Buffer.concat(Array.from({ length: Math.ceil(seconds / 0.026) }, () => frame)).toString('base64');
    }

    /** Each item answers with this much silence, so the steps can be watched as it reads. */
    async function scriptReadings(request: APIRequestContext, count: number, seconds: number) {
        const scripted = await request.post(`${FAKE}/speech`, {
            data: { kind: 'read_aloud', replies: Array.from({ length: count }, () => ({ audioBase64: silentMp3Base64(seconds) })) },
        });
        expect(scripted.ok()).toBe(true);
    }

    test('▶ reads from the step on show and the step moves with each item: a paragraph, and the action and words of a line', async ({
        page,
        request,
    }) => {
        // The rule removes the second paragraph: Read aloud speaks the shown text, so its items still land right.
        const { storyId, chatId } = await storyWithReply(page, request, [{ find: 'Somewhere above, the lamp room door creaks open on its own.', replace: '' }]);
        await scriptReadings(request, 10, 1.2);
        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await toggle(page);
        const vn = view(page);
        await expect(vn.text).toHaveText('The wind drops all at once.');
        await vn.next.click();
        await expect(vn.text).toHaveText('She smiles. Come up, then.');
        await vn.back.click();

        // From the narration step: its paragraph, then Mira's line (its action and its words are both her step), then the next.
        await vn.root.getByRole('button', { name: 'Read aloud' }).click();
        const controls = vn.root.getByRole('group', { name: 'Reading aloud' });
        await expect(controls.getByRole('button', { name: 'Pause' })).toBeVisible();
        await expect(vn.text).toHaveText('The wind drops all at once.');
        await expect(vn.text).toHaveText('She smiles. Come up, then.');
        await expect(vn.text).toHaveText('Mind the third step.');

        // To the thread: it keeps playing, with the highlight there.
        await toggle(page);
        const reply = page.getByRole('article', { name: 'AI reply' });
        await expect(reply.getByRole('group', { name: 'Reading aloud' })).toBeVisible();
        await expect(reply.locator('[aria-current="true"]')).toContainText(/Mind the third step\.|Hush, both of you\./);
        await reply.getByRole('group', { name: 'Reading aloud' }).getByRole('button', { name: 'Stop' }).click();

        // ▶ from a later step starts there.
        await toggle(page);
        await expect(vn.text).toHaveText('The wind drops all at once.');
        await vn.next.click();
        await vn.next.click();
        await expect(vn.text).toHaveText('Mind the third step.');
        await vn.root.getByRole('button', { name: 'Read aloud' }).click();
        await expect(controls.getByRole('button', { name: 'Pause' })).toBeVisible();
        await expect(vn.text).toHaveText('Mind the third step.');
        await expect(vn.speaker).toHaveText('Kai');
        const calls = (await (await request.get(`${FAKE}/calls`)).json()).calls.filter((call: { method: string }) => call.method === 'synthesizeSpeech');
        // Nothing of the removed paragraph is ever read.
        expect(JSON.stringify(calls)).not.toContain('creaks');
    });

    test('with Read replies aloud on, a send plays the new reply and the view follows it', async ({ page, request }) => {
        const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
        const storyId = (await created.json()).id as number;
        madeStories.push(storyId);
        await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse, 1890s.', opening: 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.' } });
        await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
        await request.post(`/api/stories/${storyId}/characters`, {
            data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
        });
        await request.delete(FAKE);
        const chatId = (await (await request.post(`/api/stories/${storyId}/chats`)).json()).id as number;
        await request.patch(`/api/stories/${storyId}/chats/${chatId}`, { data: { autoRead: true } });
        await request.post(`${FAKE}/text`, { data: { kind: 'turn', replies: [{ text: 'The wind drops.\n\n@Mira: Up, then.\n\nShe climbs.', model: 'glm-5.3' }] } });
        await request.post(`${FAKE}/text`, { data: { kind: 'judge', replies: ['{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}'] } });
        await request.post(`${FAKE}/text`, { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
        await scriptReadings(request, 3, 1.2);

        await page.goto(`/stories/${storyId}/chats/${chatId}`);
        await toggle(page);
        const vn = view(page);
        await page.getByRole('form', { name: 'Composer' }).getByRole('textbox', { name: 'Write as Ash' }).fill('Evening.');
        await page.getByRole('form', { name: 'Composer' }).getByRole('button', { name: 'Send' }).click();

        await expect(vn.root.getByRole('group', { name: 'Reading aloud' })).toBeVisible();
        await expect(vn.text).toHaveText('The wind drops.');
        await expect(vn.text).toHaveText('Up, then.');
        await expect(vn.text).toHaveText('She climbs.');
    });
});

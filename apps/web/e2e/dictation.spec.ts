import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Dictation is a phone gesture (spec: "Phone width"): 390px wide, with touch. Chromium's fake
// microphone (playwright.config.ts) records a test tone through a real MediaRecorder
// (.scratch/dictation/spec.md, "Testing Decisions").
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ['microphone'] });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
/** "Close the door too." */
const THAI = 'ปิดประตูด้วยนะ';

interface TranscribeCall {
    method: 'transcribe';
    request: { kind: string; language: string; durationSeconds: number; audio: { mimeType: string; size: number } };
}

/** The Stories a test made, removed after it so the shared e2e database is left as it was found. */
const madeStories: number[] = [];

test.afterEach(async ({ request }) => {
    while (madeStories.length > 0) await request.delete(`/api/stories/${madeStories.pop()}`);
    await request.delete('/api/testing/fake-gateway');
});

async function createChat(request: APIRequestContext): Promise<{ storyId: number; chatId: number }> {
    const created = await request.post('/api/stories', { data: { title: 'The Lighthouse' } });
    expect(created.ok()).toBe(true);
    const storyId = (await created.json()).id as number;
    madeStories.push(storyId);
    await request.patch(`/api/stories/${storyId}`, { data: { setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING } });
    await request.patch(`/api/stories/${storyId}/role`, { data: { name: 'Ash', description: 'The new keeper.' } });
    await request.post(`/api/stories/${storyId}/characters`, {
        data: { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' },
    });
    await request.delete('/api/testing/fake-gateway');
    const chat = await request.post(`/api/stories/${storyId}/chats`);
    expect(chat.ok()).toBe(true);
    return { storyId, chatId: (await chat.json()).id as number };
}

async function scriptTranscriptions(request: APIRequestContext, replies: unknown[]): Promise<void> {
    const scripted = await request.post('/api/testing/fake-gateway/transcription', { data: { replies } });
    expect(scripted.ok()).toBe(true);
}

async function fakeGateway(request: APIRequestContext): Promise<{ transcriptions: TranscribeCall[]; pending: Record<string, number> }> {
    const body = await (await request.get('/api/testing/fake-gateway/calls')).json();
    return {
        transcriptions: body.calls.filter((call: { method: string }) => call.method === 'transcribe'),
        pending: body.pendingReplies,
    };
}

/** Holds the dictation answer until `release` is called, so a test can look at the wait. */
async function holdTranscription(page: Page, storyId: number, chatId: number): Promise<() => void> {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(`**/api/stories/${storyId}/chats/${chatId}/dictation`, async (route) => {
        await held;
        await route.continue();
    });
    return release;
}

function composerParts(page: Page) {
    const composer = page.getByRole('form', { name: 'Composer' });
    const tools = composer.getByRole('toolbar', { name: 'Composer tools' });
    return {
        composer,
        box: composer.getByRole('textbox', { name: 'Write as Ash' }),
        mic: composer.getByRole('button', { name: 'Dictate' }),
        bar: composer.getByRole('group', { name: 'Recording' }),
        suggest: tools.getByRole('button', { name: 'Suggest replies' }),
        pen: tools.getByRole('button', { name: 'Write for me' }),
    };
}

/** Records for a little over a second, the shortest a recording is sent. */
async function recordABit(page: Page, bar: Locator): Promise<void> {
    await expect(bar.getByRole('timer')).toBeVisible();
    await page.waitForTimeout(1_300);
}

test('🎤 records, and Done appends the Thai it heard to the typed draft; ⚡ and ✍️ wait meanwhile', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptTranscriptions(request, [`  ${THAI}  `]);
    const release = await holdTranscription(page, storyId, chatId);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { composer, box, mic, bar, suggest, pen } = composerParts(page);
    await box.fill('*I lock the door.*');
    await expect(mic).toHaveAttribute('title', 'Speak instead of typing');

    await mic.tap();

    // The box row becomes the recording bar: Cancel, the time, the language, Done.
    await expect(bar).toBeVisible();
    await expect(box).toHaveCount(0);
    await expect(bar.getByRole('timer')).toHaveText(/^0:0\d$/);
    await expect(bar.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(suggest).toBeDisabled();
    await expect(pen).toBeDisabled();

    // The language switch flips and flips back; Thai is the default.
    const language = bar.getByRole('button', { name: 'Dictation language' });
    await expect(language).toHaveText('ไทย');
    await language.tap();
    await expect(language).toHaveText('EN');
    await language.tap();
    await expect(language).toHaveText('ไทย');

    await recordABit(page, bar);
    await bar.getByRole('button', { name: 'Done' }).tap();

    // While it transcribes: the panel says so, the box is back but read-only, ⚡ and ✍️ still wait.
    await expect(composer.getByRole('status').filter({ hasText: 'Transcribing…' })).toBeVisible();
    await expect(bar).toHaveCount(0);
    await expect(box).not.toBeEditable();
    await expect(mic).toHaveAttribute('aria-busy', 'true');
    await expect(suggest).toBeDisabled();
    await expect(pen).toBeDisabled();
    release();

    // The text joins the draft after one space, and nothing is sent.
    await expect(box).toHaveValue(`*I lock the door.* ${THAI}`);
    await expect(composer.getByText('Transcribing…')).toHaveCount(0);
    await expect(box).toBeEditable();
    await expect(box).not.toBeFocused();
    await expect(suggest).toBeEnabled();
    await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(0);

    const { transcriptions } = await fakeGateway(request);
    expect(transcriptions).toHaveLength(1);
    const [call] = transcriptions;
    expect(call.request.language).toBe('th');
    expect(call.request.audio.mimeType).toBe('audio/webm');
    expect(call.request.audio.size).toBeGreaterThan(0);
    expect(call.request.durationSeconds).toBeGreaterThanOrEqual(1);
});

test('the language chosen stays on this device, and is the one sent', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptTranscriptions(request, ['Close the door.']);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    let parts = composerParts(page);
    await parts.mic.tap();
    await parts.bar.getByRole('button', { name: 'Dictation language' }).tap();
    await parts.bar.getByRole('button', { name: 'Cancel' }).tap();

    await page.reload();
    parts = composerParts(page);
    await parts.mic.tap();
    await expect(parts.bar.getByRole('button', { name: 'Dictation language' })).toHaveText('EN');
    await recordABit(page, parts.bar);
    await parts.bar.getByRole('button', { name: 'Done' }).tap();

    // An empty box takes the text as it is, with no space before it.
    await expect(parts.box).toHaveValue('Close the door.');
    const { transcriptions } = await fakeGateway(request);
    expect(transcriptions.map((call) => call.request.language)).toEqual(['en']);
});

test('Cancel throws the recording away with no call, and a recording under a second is dropped', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptTranscriptions(request, ['never used']);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { composer, box, mic, bar } = composerParts(page);
    await box.fill('Hello');

    await mic.tap();
    await recordABit(page, bar);
    await bar.getByRole('button', { name: 'Cancel' }).tap();
    await expect(bar).toHaveCount(0);
    await expect(box).toHaveValue('Hello');

    await mic.tap();
    await bar.getByRole('button', { name: 'Done' }).tap();
    await expect(composer.getByRole('status').filter({ hasText: 'That was too short.' })).toBeVisible();
    await expect(box).toHaveValue('Hello');

    const { transcriptions, pending } = await fakeGateway(request);
    expect(transcriptions).toEqual([]);
    expect(pending).toEqual({ dictation: 1 });
});

test('a failed transcription keeps the recording, and Retry sends it again', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptTranscriptions(request, [{ error: 'outage', message: 'Venice: down' }, THAI]);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { composer, box, mic, bar } = composerParts(page);

    await mic.tap();
    await recordABit(page, bar);
    await bar.getByRole('button', { name: 'Done' }).tap();

    const failure = composer.getByRole('alert').filter({ hasText: "Couldn't transcribe that." });
    await expect(failure).toBeVisible();
    await expect(box).toHaveValue('');
    await failure.getByRole('button', { name: 'Retry' }).tap();

    await expect(box).toHaveValue(THAI);
    await expect(failure).toHaveCount(0);
    const { transcriptions } = await fakeGateway(request);
    expect(transcriptions).toHaveLength(2);
    expect(transcriptions[1].request.audio.size).toBe(transcriptions[0].request.audio.size);
});

test("nothing heard says so, and Discard after a failure drops the recording", async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptTranscriptions(request, ['   ', { error: 'outage' }]);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { composer, box, mic, bar } = composerParts(page);

    await mic.tap();
    await recordABit(page, bar);
    await bar.getByRole('button', { name: 'Done' }).tap();
    await expect(composer.getByRole('status').filter({ hasText: "Didn't catch anything." })).toBeVisible();
    await expect(box).toHaveValue('');

    await mic.tap();
    await recordABit(page, bar);
    await bar.getByRole('button', { name: 'Done' }).tap();
    const failure = composer.getByRole('alert').filter({ hasText: "Couldn't transcribe that." });
    await failure.getByRole('button', { name: 'Discard' }).tap();
    await expect(failure).toHaveCount(0);
    expect((await fakeGateway(request)).transcriptions).toHaveLength(2);
});

test('a blocked microphone says how to allow it, and records nothing', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await page.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    });

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { composer, mic, bar } = composerParts(page);
    await mic.tap();

    await expect(
        composer.getByRole('status').filter({ hasText: "The microphone is blocked. Allow it for this site in your browser's settings, then try again." }),
    ).toBeVisible();
    await expect(bar).toHaveCount(0);
    expect((await fakeGateway(request)).transcriptions).toEqual([]);
});

test('Cancel while the browser still asks for the microphone records nothing', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await page.addInitScript(() => {
        // The permission prompt, held open for a second and a half.
        const ask = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = (constraints) => new Promise((resolve) => setTimeout(() => resolve(ask(constraints)), 1_500));
    });

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { mic, bar, box } = composerParts(page);
    await mic.tap();
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'Cancel' }).tap();
    await expect(bar).toHaveCount(0);

    // The stream arrives after the Cancel and is closed unused: no recording bar comes back.
    await page.waitForTimeout(2_000);
    await expect(bar).toHaveCount(0);
    await expect(box).toBeEditable();
    await expect(mic).toBeEnabled();
});

test('🎤 is hidden where the browser cannot record, and disabled with Venice credit used up', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await request.put('/api/testing/fake-gateway/credit', { data: { image: { remainingUsd: 0, limitUsd: null } } });

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { mic, box } = composerParts(page);
    await expect(box).toBeVisible();
    await expect(mic).toBeDisabled();
    await expect(mic).toHaveAttribute('title', 'Venice credit is used up');

    await request.delete('/api/testing/fake-gateway');
    await page.addInitScript(() => {
        // @ts-expect-error: a browser without recording.
        delete window.MediaRecorder;
    });
    await page.reload();
    await expect(composerParts(page).box).toBeVisible();
    await expect(composerParts(page).mic).toHaveCount(0);
});

test('the Usage page lists Dictation under "Images and audio (Venice)", and Settings names the pool the same', async ({ page }) => {
    const pool = (byKind: object[]) => ({
        spentUsd: 0.05,
        calls: 2,
        byKind,
        remainingUsd: 8,
        capUsd: 8,
        lowCreditPercent: 20,
        lowCredit: false,
    });
    await page.route('**/api/usage', (route) =>
        route.fulfill({
            json: {
                month: '2026-11',
                pools: {
                    text: pool([]),
                    image: pool([
                        { kind: 'snapshot_image', spentUsd: 0.05, calls: 1 },
                        { kind: 'dictation', spentUsd: 0.0008, calls: 1 },
                    ]),
                },
            },
        }),
    );

    await page.goto('/usage');
    await expect(page.getByRole('heading', { name: 'Images and audio (Venice)', exact: true })).toBeVisible();
    const kinds = page.getByRole('list', { name: 'Images and audio (Venice) spend by kind' }).getByRole('listitem');
    await expect(kinds).toHaveText(['Snapshots: $0.05 (1 call)', 'Dictation: <$0.01 (1 call)']);

    await page.goto('/settings');
    await expect(page.getByLabel('Images and audio (Venice) pool (USD)')).toBeVisible();
    await expect(page.getByLabel('Images and audio (Venice) warning (%)')).toBeVisible();
});

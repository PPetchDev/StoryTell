import { APIRequestContext, expect, Locator, Page, test } from '@playwright/test';

// Dictation is a phone gesture (spec: "Phone width"): 390px wide, with touch. Chromium's fake
// microphone (playwright.config.ts) records a test tone through a real MediaRecorder
// (.scratch/dictation/spec.md, "Testing Decisions").
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ['microphone'] });

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';
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

/** Holds every request to `url` until the returned function is called. */
async function holdRoute(page: Page, url: string): Promise<() => void> {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(url, async (route) => {
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

/** Keeps every stream the page is given, to see whether its tracks were stopped. Call before the page loads. */
async function trackMicStreams(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const ask = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        const streams: MediaStream[] = [];
        (window as unknown as { micStreams: MediaStream[] }).micStreams = streams;
        navigator.mediaDevices.getUserMedia = async (constraints) => {
            const stream = await ask(constraints);
            streams.push(stream);
            return stream;
        };
    });
}

/** The state of every microphone track the page has been given, oldest first. */
function micTrackStates(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        (window as unknown as { micStreams: MediaStream[] }).micStreams.flatMap((stream) => stream.getTracks().map((track) => track.readyState)),
    );
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

test('with no microphone, it says none was found, and records nothing', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await page.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Requested device not found', 'NotFoundError'));
    });

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { composer, mic, bar, box } = composerParts(page);
    await mic.tap();

    await expect(composer.getByRole('status').filter({ hasText: 'No microphone found.' })).toBeVisible();
    await expect(bar).toHaveCount(0);
    await expect(box).toBeEditable();
    expect((await fakeGateway(request)).transcriptions).toEqual([]);
});

test('at 2:00 the recording finishes by itself, as Done does', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptTranscriptions(request, [THAI]);
    // The page's clock: it runs as usual until the test jumps it forward.
    await page.clock.install();

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { box, mic, bar } = composerParts(page);
    await mic.tap();
    await expect(bar.getByRole('timer')).toBeVisible();
    // A little real audio, then nearly two minutes on the clock: still recording.
    await page.waitForTimeout(300);
    await page.clock.fastForward('01:50');
    await expect(bar.getByRole('timer')).toHaveText(/^1:5\d$/);
    await expect(bar).toBeVisible();

    await page.clock.fastForward(10_000);

    // Finished as Done: sent, and the text joins the box; nothing is sent as a Message.
    await expect(bar).toHaveCount(0);
    await expect(box).toHaveValue(THAI);
    await expect(page.getByRole('article', { name: 'Ash said' })).toHaveCount(0);
    const { transcriptions } = await fakeGateway(request);
    expect(transcriptions).toHaveLength(1);
    expect(transcriptions[0].request.durationSeconds).toBeGreaterThanOrEqual(120);
    expect(transcriptions[0].request.durationSeconds).toBeLessThan(125);
    expect(transcriptions[0].request.audio.size).toBeGreaterThan(0);
});

test('the page going hidden finishes the recording as Done', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptTranscriptions(request, [THAI]);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { box, mic, bar } = composerParts(page);
    await box.fill('Wait.');
    await mic.tap();
    await recordABit(page, bar);

    // Switching app, or locking the phone, then coming back.
    await page.evaluate(() => {
        const setVisibility = (state: DocumentVisibilityState) => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
            document.dispatchEvent(new Event('visibilitychange'));
        };
        setVisibility('hidden');
        setVisibility('visible');
    });

    await expect(bar).toHaveCount(0);
    await expect(box).toHaveValue(`Wait. ${THAI}`);
    const { transcriptions } = await fakeGateway(request);
    expect(transcriptions).toHaveLength(1);
    expect(transcriptions[0].request.durationSeconds).toBeGreaterThanOrEqual(1);
});

test('leaving the Chat screen cancels the recording: the microphone is released, and nothing is sent', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptTranscriptions(request, ['never used']);
    await trackMicStreams(page);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { mic, bar } = composerParts(page);
    await mic.tap();
    await recordABit(page, bar);

    // Within the app, so the page itself stays: only the Chat screen goes.
    await page.getByRole('link', { name: 'Back to Chats' }).click();
    await expect(page).toHaveURL(new RegExp(`/stories/${storyId}(/chats)?$`));
    await expect(bar).toHaveCount(0);

    await expect.poll(() => micTrackStates(page)).toEqual(['ended']);
    // Give a late send its chance: none comes.
    await page.waitForTimeout(1_000);
    const { transcriptions, pending } = await fakeGateway(request);
    expect(transcriptions).toEqual([]);
    expect(pending).toEqual({ dictation: 1 });
});

test('the mic is let go every time: after Done, after a recording too short to send, and after Cancel', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptTranscriptions(request, [THAI]);
    await trackMicStreams(page);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { composer, box, mic, bar } = composerParts(page);

    await mic.tap();
    await recordABit(page, bar);
    await bar.getByRole('button', { name: 'Done' }).tap();
    await expect(box).toHaveValue(THAI);
    await expect.poll(() => micTrackStates(page)).toEqual(['ended']);

    await mic.tap();
    await bar.getByRole('button', { name: 'Done' }).tap();
    await expect(composer.getByRole('status').filter({ hasText: 'That was too short.' })).toBeVisible();
    await expect.poll(() => micTrackStates(page)).toEqual(['ended', 'ended']);

    await mic.tap();
    await recordABit(page, bar);
    await bar.getByRole('button', { name: 'Cancel' }).tap();
    await expect(bar).toHaveCount(0);
    await expect.poll(() => micTrackStates(page)).toEqual(['ended', 'ended', 'ended']);
});

test('Venice credit used up during a transcription says so, and keeps the recording for Retry or Discard', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptTranscriptions(request, [{ error: 'out_of_credit', pool: 'image' }]);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { composer, box, mic, bar } = composerParts(page);
    await mic.tap();
    await recordABit(page, bar);
    await bar.getByRole('button', { name: 'Done' }).tap();

    const failure = composer.getByRole('alert').filter({ hasText: 'Venice credit is used up.' });
    await expect(failure).toBeVisible();
    await expect(failure.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(failure.getByRole('button', { name: 'Discard' })).toBeVisible();
    await expect(composer.getByText("Couldn't transcribe that.")).toHaveCount(0);
    await expect(box).toHaveValue('');
});

test('🎤 is hidden where the browser has no getUserMedia', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await page.addInitScript(() => {
        Object.defineProperty(MediaDevices.prototype, 'getUserMedia', { value: undefined, configurable: true });
    });

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { box, mic } = composerParts(page);
    await expect(box).toBeVisible();
    await expect(mic).toHaveCount(0);
});

test('🎤 waits while transcribing, while Write for me writes, and while a turn is written', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await scriptTranscriptions(request, [THAI]);
    const releaseTranscription = await holdTranscription(page, storyId, chatId);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { composer, box, mic, bar, pen } = composerParts(page);

    // Transcribing.
    await mic.tap();
    await recordABit(page, bar);
    await bar.getByRole('button', { name: 'Done' }).tap();
    await expect(composer.getByRole('status').filter({ hasText: 'Transcribing…' })).toBeVisible();
    await expect(mic).toBeDisabled();
    releaseTranscription();
    await expect(box).toHaveValue(THAI);
    await expect(mic).toBeEnabled();

    // Write for me writing.
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'write_for_me', replies: ['I close the door.'] } });
    const releaseWrite = await holdRoute(page, `**/api/stories/${storyId}/chats/${chatId}/write-for-me`);
    await pen.tap();
    await expect(mic).toBeDisabled();
    await expect(mic).toHaveAttribute('title', 'Wait for the current write to finish');
    releaseWrite();
    await expect(box).toHaveValue('I close the door.');
    await expect(mic).toBeEnabled();

    // A turn being written.
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'turn', replies: [{ text: '@Mira: Good.', model: 'glm-5.3' }] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'judge', replies: [NO_CHANGE] } });
    await request.post('/api/testing/fake-gateway/text', { data: { kind: 'memory_extraction', replies: [NO_OPS] } });
    const releaseSend = await holdRoute(page, `**/api/stories/${storyId}/chats/${chatId}/messages`);
    await composer.getByRole('button', { name: 'Send' }).tap();
    await expect(mic).toBeDisabled();
    await expect(mic).toHaveAttribute('title', 'Wait for the current write to finish');
    releaseSend();
    await expect(page.getByText('Good.', { exact: true })).toBeVisible();
    await expect(mic).toBeEnabled();
});

test('while recording, the whole tool row waits', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { composer, mic, bar } = composerParts(page);
    const tools = composer.getByRole('toolbar', { name: 'Composer tools' });
    const names = ['Suggest replies', 'Write for me', 'Saved replies', 'Write an action'];
    await expect(tools.getByRole('button')).toHaveCount(names.length);
    for (const name of names) await expect(tools.getByRole('button', { name })).toBeEnabled();

    await mic.tap();
    await expect(bar.getByRole('button', { name: 'Done' })).toBeEnabled();
    for (const name of names) await expect(tools.getByRole('button', { name })).toBeDisabled();

    await bar.getByRole('button', { name: 'Cancel' }).tap();
    await expect(bar).toHaveCount(0);
    for (const name of names) await expect(tools.getByRole('button', { name })).toBeEnabled();
});

test('the recorder asks for the first type the browser can record: WebM/Opus, then MP4, then Ogg/Opus', async ({ page, request }) => {
    const { storyId, chatId } = await createChat(request);
    await page.addInitScript(() => {
        // The real recorder, with the browser's answer to "can you record this type?" set by the test.
        const Real = window.MediaRecorder;
        const probe = window as unknown as { askedTypes: Array<string | null>; supportedTypes: string[] | null };
        probe.askedTypes = [];
        probe.supportedTypes = null;
        class Probe extends Real {
            constructor(stream: MediaStream, options?: MediaRecorderOptions) {
                probe.askedTypes.push(options?.mimeType ?? null);
                super(stream);
            }
            static isTypeSupported(type: string): boolean {
                return probe.supportedTypes ? probe.supportedTypes.includes(type) : Real.isTypeSupported(type);
            }
        }
        window.MediaRecorder = Probe;
    });

    await page.goto(`/stories/${storyId}/chats/${chatId}`);
    const { mic, bar } = composerParts(page);
    const cases: Array<[string[] | null, string | null]> = [
        [null, 'audio/webm;codecs=opus'],
        [['audio/ogg;codecs=opus', 'audio/mp4'], 'audio/mp4'],
        [['audio/ogg;codecs=opus'], 'audio/ogg;codecs=opus'],
        [[], null],
    ];
    for (const [supported] of cases) {
        await page.evaluate((types) => {
            (window as unknown as { supportedTypes: string[] | null }).supportedTypes = types;
        }, supported);
        await mic.tap();
        await expect(bar.getByRole('button', { name: 'Done' })).toBeEnabled();
        await bar.getByRole('button', { name: 'Cancel' }).tap();
        await expect(bar).toHaveCount(0);
    }
    expect(await page.evaluate(() => (window as unknown as { askedTypes: Array<string | null> }).askedTypes)).toEqual(cases.map(([, asked]) => asked));
});

test('the low-credit banner names the Venice pool "Images and audio (Venice)"', async ({ page }) => {
    const pool = (remainingUsd: number, lowCredit: boolean) => ({
        spentUsd: 8 - remainingUsd,
        calls: 3,
        byKind: [],
        remainingUsd,
        capUsd: 8,
        lowCreditPercent: 20,
        lowCredit,
    });
    await page.route('**/api/usage', (route) => route.fulfill({ json: { month: '2026-11', pools: { text: pool(6, false), image: pool(1, true) } } }));

    await page.goto('/');
    const banner = page.getByRole('status').filter({ hasText: 'credit is low' });
    await expect(banner.getByRole('paragraph')).toHaveText(['Images and audio (Venice) credit is low: $1.00 of $8.00 left.']);
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

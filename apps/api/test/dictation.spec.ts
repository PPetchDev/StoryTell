import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { fixture, RecordedRequest } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/** The first bytes each recording format starts with, and filler: the API sniffs them as images are sniffed. */
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('synthetic webm audio')]);
const M4A = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x1c]), Buffer.from('ftypM4A synthetic aac audio')]);
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.from('synthetic opus audio')]);
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVEfmt synthetic pcm')]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

const MIRA = { name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' };

async function playableChat(t: TestApp): Promise<{ storyId: number; chatId: number }> {
    const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
    const storyId = created.body.id as number;
    await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'An island.', opening: 'The lamp is out.' }).expect(200);
    await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The keeper.' }).expect(200);
    await t.http.post(`/api/stories/${storyId}/characters`).send(MIRA).expect(201);
    const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
    return { storyId, chatId };
}

// .scratch/dictation/spec.md, "API".
describe('Dictation', () => {
    let t: TestApp;
    let storyId: number;
    let chatId: number;

    beforeAll(async () => {
        t = await startTestApp();
        ({ storyId, chatId } = await playableChat(t));
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    function dictate(audio: Buffer | null, fields: Record<string, string> = {}, filename = 'dictation.webm') {
        const request = t.http.post(`/api/stories/${storyId}/chats/${chatId}/dictation`);
        for (const [name, value] of Object.entries({ language: 'th', durationMs: '7200', ...fields })) request.field(name, value);
        return audio ? request.attach('audio', audio, filename) : request;
    }

    it.each([
        ['WebM', WEBM, 'audio/webm', 'th'],
        ['M4A', M4A, 'audio/mp4', 'en'],
    ])('transcribes a %s recording: the gateway gets its bytes, type, language and duration, and the text comes back trimmed', async (_name, audio, mimeType, language) => {
        t.gateway.scriptTranscription('  ปิดตะเกียงแล้วค่ะ  ');

        const { body } = await dictate(audio, { language, durationMs: '7200' }).expect(200);

        expect(body).toEqual({ text: 'ปิดตะเกียงแล้วค่ะ' });
        const [call] = t.gateway.transcriptionCalls();
        expect(call.kind).toBe('dictation');
        expect(call.language).toBe(language);
        expect(call.durationSeconds).toBe(7.2);
        expect(call.audio.mimeType).toBe(mimeType);
        expect(call.audio.bytes.equals(audio)).toBe(true);
        expect(call.servedFor).toEqual({ storyId, chatId });
    });

    it('accepts Ogg and WAV too', async () => {
        t.gateway.scriptTranscription('one', 'two');

        await dictate(OGG, {}, 'a.ogg').expect(200);
        await dictate(WAV, {}, 'a.wav').expect(200);

        expect(t.gateway.transcriptionCalls().map((call) => call.audio.mimeType)).toEqual(['audio/ogg', 'audio/wav']);
    });

    it('answers an empty text when nothing was heard', async () => {
        t.gateway.scriptTranscription('   ');

        const { body } = await dictate(WEBM).expect(200);

        expect(body).toEqual({ text: '' });
    });

    it('stores nothing in the Chat', async () => {
        const before = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
        t.gateway.scriptTranscription('Boots off.');

        await dictate(WEBM).expect(200);

        const after = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
        expect(after.messages).toEqual(before.messages);
    });

    describe('refuses before any call', () => {
        it.each([
            ['no file', () => dictate(null), 400, '400.009.001'],
            ['bytes that are not a recording', () => dictate(PNG, {}, 'x.webm'), 415, '415.009.002'],
            ['a recording over two minutes and five seconds', () => dictate(WEBM, { durationMs: '125001' }), 422, '422.009.004'],
            ['a language other than th or en', () => dictate(WEBM, { language: 'fr' }), 400, '400.000.000'],
            ['a missing duration', () => dictate(WEBM, { durationMs: '' }), 400, '400.000.000'],
        ])('%s', async (_case, send, status, code) => {
            t.gateway.scriptTranscription('never used');

            const { body } = await send().expect(status);

            expect(body.error.code).toBe(code);
            expect(t.gateway.transcriptionCalls()).toEqual([]);
        });

        it('a file over 10 MB', async () => {
            const big = Buffer.concat([WEBM, Buffer.alloc(10 * 1024 * 1024)]);

            const { body } = await dictate(big).expect(413);

            expect(body.error.code).toBe('413.009.003');
            expect(t.gateway.transcriptionCalls()).toEqual([]);
        });

        it('the Venice pool known to be used up', async () => {
            t.gateway.setRemainingCredit({ image: { remainingUsd: 0, limitUsd: null } });

            const { body } = await dictate(WEBM).expect(402);

            expect(body.error.code).toBe('402.001.004');
            expect(t.gateway.transcriptionCalls()).toEqual([]);
        });

        it('a Chat of another Story', async () => {
            const other = await playableChat(t);

            await t.http
                .post(`/api/stories/${storyId}/chats/${other.chatId}/dictation`)
                .field('language', 'th')
                .field('durationMs', '2000')
                .attach('audio', WEBM, 'a.webm')
                .expect(404);
            expect(t.gateway.transcriptionCalls()).toEqual([]);
        });
    });

    it('passes an outage through as 502.001.001', async () => {
        t.gateway.scriptTranscription(new ProviderOutageError('Venice: down'));

        const { body } = await dictate(WEBM).expect(502);

        expect(body.error.code).toBe('502.001.001');
    });

    describe('through the testing controls', () => {
        it("scripts a transcription, and lists the call with its audio summarised, never its bytes", async () => {
            await t.http.post('/api/testing/fake-gateway/transcription').send({ replies: ['Hello there.'] }).expect(204);

            const { body } = await dictate(WEBM, { language: 'en' }).expect(200);
            expect(body).toEqual({ text: 'Hello there.' });

            const calls = (await t.http.get('/api/testing/fake-gateway/calls').expect(200)).body.calls;
            const call = calls.find((candidate: { method: string }) => candidate.method === 'transcribe');
            expect(call.request.audio).toEqual({ mimeType: 'audio/webm', size: WEBM.length });
            expect(call.request.language).toBe('en');
            expect(JSON.stringify(calls)).not.toContain(WEBM.toString('base64'));
        });

        it('scripts a failure, which the reset clears', async () => {
            await t.http
                .post('/api/testing/fake-gateway/transcription')
                .send({ replies: [{ error: 'outage', message: 'scripted' }] })
                .expect(204);
            expect((await t.http.get('/api/testing/fake-gateway/calls').expect(200)).body.pendingReplies).toEqual({ dictation: 1 });

            await t.http.delete('/api/testing/fake-gateway').expect(204);

            expect((await t.http.get('/api/testing/fake-gateway/calls').expect(200)).body.pendingReplies).toEqual({});
        });
    });

    it('fails loudly when nothing is scripted', async () => {
        await expect(t.gateway.transcribe({
            kind: 'dictation',
            audio: { bytes: WEBM, mimeType: 'audio/webm' },
            language: 'th',
            durationSeconds: 2,
        })).rejects.toThrow(/no scripted reply for transcription/);
    });
});

describe('Dictation through the real gateway', () => {
    let t: TestApp;
    let requests: RecordedRequest[];

    beforeAll(async () => {
        requests = [];
        // Routes by URL: the gate reads credit before the call.
        const routed: FetchLike = async (url, init) => {
            requests.push({ url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: undefined });
            const json = url.endsWith('/credits')
                ? fixture('openrouter/credits.json')
                : url.endsWith('/billing/balance')
                  ? fixture('venice/balance.json')
                  : { text: 'ปิดประตูด้วย', duration: 4.5 };
            return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        t = await startTestApp({ modelGateway: 'real', fetch: routed, providerKeys: TEST_KEYS });
    });

    afterAll(async () => {
        await t.close();
    });

    it('records the spend as Dictation in the Venice pool on the Usage summary', async () => {
        const { storyId, chatId } = await playableChat(t);

        const { body } = await t.http
            .post(`/api/stories/${storyId}/chats/${chatId}/dictation`)
            .field('language', 'th')
            .field('durationMs', '4400')
            .attach('audio', WEBM, 'dictation.webm')
            .expect(200);

        expect(body).toEqual({ text: 'ปิดประตูด้วย' });
        expect(requests.filter((request) => request.url.endsWith('/audio/transcriptions'))).toHaveLength(1);
        const usage = (await t.http.get('/api/usage').expect(200)).body;
        expect(usage.pools.image.byKind).toEqual([{ kind: 'dictation', spentUsd: 0.0005, calls: 1 }]);
    });
});

import {
    ModelRefusalError,
    OutOfCreditError,
} from '../src/errors/model-gateway.errors.js';
import {
    FAKE_MP3,
    FAKE_PNG,
    FAKE_SPEECH_MODEL,
    FAKE_TEXT_MODEL,
    silentMp3,
} from '../src/service/model-gateway/fake-model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// The fake is the harness every later ticket scripts, so its own contract is pinned here.
describe('Fake Model Gateway', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    it('replays scripted text replies per call kind, in order, and records each call', async () => {
        t.gateway.scriptText('turn', 'first', { text: 'second', model: 'other/model' });

        const first = await t.gateway.completeText({
            kind: 'turn',
            messages: [{ role: 'user', content: 'hello' }],
            stop: ['\n@You:'],
        });
        const second = await t.gateway.completeText({ kind: 'turn', messages: [] });

        expect(first).toMatchObject({ text: 'first', model: FAKE_TEXT_MODEL });
        expect(second).toMatchObject({ text: 'second', model: 'other/model' });
        expect(t.gateway.textCalls('turn')[0]).toMatchObject({
            messages: [{ role: 'user', content: 'hello' }],
            stop: ['\n@You:'],
        });
        expect(t.gateway.pendingReplies()).toEqual({});
    });

    it('rejects with a scripted typed error', async () => {
        t.gateway.scriptText('judge', new ModelRefusalError());
        t.gateway.scriptImage('snapshot_image', new OutOfCreditError('image'));

        await expect(t.gateway.completeText({ kind: 'judge', messages: [] })).rejects.toThrow(
            ModelRefusalError,
        );
        await expect(
            t.gateway.generateImage({ kind: 'snapshot_image', prompt: 'p' }),
        ).rejects.toMatchObject({ code: '402.001.004', pool: 'image' });
    });

    it('fails loudly when a call has no scripted reply', async () => {
        await expect(t.gateway.completeText({ kind: 'turn', messages: [] })).rejects.toThrow(
            /no scripted reply for text call "turn"/,
        );
    });

    it('refuses more than 3 reference images', async () => {
        t.gateway.scriptImage('snapshot_image', {});

        await expect(
            t.gateway.generateImage({
                kind: 'snapshot_image',
                prompt: 'p',
                referenceImages: [FAKE_PNG, FAKE_PNG, FAKE_PNG, FAKE_PNG],
            }),
        ).rejects.toThrow(RangeError);
    });

    it('can be scripted and inspected over HTTP for browser tests', async () => {
        await t.http
            .post('/api/testing/fake-gateway/text')
            .send({ kind: 'story_draft', replies: ['{"title":"T"}', { error: 'outage' }] })
            .expect(204);

        const reply = await t.gateway.completeText({ kind: 'story_draft', messages: [] });
        const failure = t.gateway.completeText({ kind: 'story_draft', messages: [] });

        expect(reply.text).toBe('{"title":"T"}');
        await expect(failure).rejects.toMatchObject({ code: '502.001.001' });
        const { body } = await t.http.get('/api/testing/fake-gateway/calls').expect(200);
        expect(body.calls).toHaveLength(2);
        expect(body.calls[0]).toMatchObject({
            method: 'completeText',
            request: { kind: 'story_draft' },
        });
    });

    it('streams a scripted reply in pieces, slowed and failing as scripted over HTTP', async () => {
        await t.http
            .post('/api/testing/fake-gateway/text')
            .send({
                kind: 'turn',
                replies: [
                    { text: 'Rain on the glass.', pieceSize: 5, pieceDelayMs: 20 },
                    { text: 'Rain on the glass.', pieceSize: 5, failAfterPieces: 2, failWith: { error: 'refusal' } },
                ],
            })
            .expect(204);
        const open = new AbortController().signal;

        const pieces: string[] = [];
        const startedAt = Date.now();
        const result = await t.gateway.streamText({ kind: 'turn', messages: [] }, { onText: (piece) => pieces.push(piece), signal: open });
        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(60);
        expect(pieces).toEqual(['Rain ', 'on th', 'e gla', 'ss.']);
        expect(result).toMatchObject({ text: 'Rain on the glass.', stopped: false });

        const failed: string[] = [];
        await expect(
            t.gateway.streamText({ kind: 'turn', messages: [] }, { onText: (piece) => failed.push(piece), signal: open }),
        ).rejects.toBeInstanceOf(ModelRefusalError);
        expect(failed).toEqual(['Rain ', 'on th']);

        const { body } = await t.http.get('/api/testing/fake-gateway/calls').expect(200);
        expect(body.calls.map((call: { method: string }) => call.method)).toEqual(['streamText', 'streamText']);
    });

    it('ends a stream early when its signal aborts, resolving with the text so far', async () => {
        t.gateway.scriptText('turn', { text: 'Rain on the glass.', pieceSize: 5, pieceDelayMs: 10 });
        const stop = new AbortController();

        const result = await t.gateway.streamText(
            { kind: 'turn', messages: [] },
            { onText: (piece) => piece === 'on th' && stop.abort(), signal: stop.signal },
        );

        expect(result).toMatchObject({ text: 'Rain on th', stopped: true });
        expect(t.gateway.calls[0]).toMatchObject({ method: 'streamText', stopped: true });
    });

    // .scratch/read-aloud/spec.md, "Fake gateway".
    describe('speech', () => {
        it('answers scripted speech per kind, in order, with FAKE_MP3 and the text length by default', async () => {
            t.gateway.scriptSpeech('read_aloud', {}, { characters: 99 });
            t.gateway.scriptSpeech('voice_preview', new OutOfCreditError('image'));

            const first = await t.gateway.synthesizeSpeech({ kind: 'read_aloud', text: 'Hello there.', voice: 'af_sky' });
            const second = await t.gateway.synthesizeSpeech({ kind: 'read_aloud', text: 'Again.', voice: 'bm_george' });
            const refused = t.gateway.synthesizeSpeech({ kind: 'voice_preview', text: 'Sample.', voice: 'af_sky' });

            expect(first).toEqual({ audio: FAKE_MP3, model: FAKE_SPEECH_MODEL, characters: 12, costUsd: 0 });
            expect(second.characters).toBe(99);
            await expect(refused).rejects.toMatchObject({ code: '402.001.004', pool: 'image' });
            expect(t.gateway.speechCalls('read_aloud').map((call) => call.voice)).toEqual(['af_sky', 'bm_george']);
            expect(t.gateway.speechCalls('voice_preview')).toHaveLength(1);
            expect(t.gateway.pendingReplies()).toEqual({});
        });

        it('fails loudly when a speech call has no scripted reply, and refuses text over the limit', async () => {
            await expect(t.gateway.synthesizeSpeech({ kind: 'read_aloud', text: 'Hi.', voice: 'af_sky' })).rejects.toThrow(
                /no scripted reply for speech call "read_aloud"/,
            );
            t.gateway.scriptSpeech('read_aloud', {});
            await expect(
                t.gateway.synthesizeSpeech({ kind: 'read_aloud', text: 'a'.repeat(4097), voice: 'af_sky' }),
            ).rejects.toBeInstanceOf(RangeError);
        });

        it('answers four voices, two American and two British, female and male, unless scripted', async () => {
            const voices = await t.gateway.speechVoices();
            expect(voices.map((voice) => [voice.accent, voice.gender])).toEqual([
                ['american', 'female'],
                ['american', 'male'],
                ['british', 'female'],
                ['british', 'male'],
            ]);
            expect(t.gateway.calls).toEqual([]);

            t.gateway.setSpeechVoices([{ id: 'af_nova', label: 'Nova — American, female', accent: 'american', gender: 'female' }]);
            expect((await t.gateway.speechVoices()).map((voice) => voice.id)).toEqual(['af_nova']);
            t.gateway.reset();
            expect(await t.gateway.speechVoices()).toEqual(voices);
        });

        it('can be scripted over HTTP, held back, failed, and listed by kind, voice and text without bytes', async () => {
            await t.http
                .post('/api/testing/fake-gateway/speech')
                .send({ kind: 'read_aloud', replies: [{ delayMs: 50 }, { error: 'refusal' }] })
                .expect(204);

            const startedAt = Date.now();
            const answered = await t.gateway.synthesizeSpeech({ kind: 'read_aloud', text: 'Rain.', voice: 'bf_emma' });
            expect(Date.now() - startedAt).toBeGreaterThanOrEqual(45);
            expect(Buffer.compare(answered.audio.bytes, FAKE_MP3.bytes)).toBe(0);
            await expect(
                t.gateway.synthesizeSpeech({ kind: 'read_aloud', text: 'Sea.', voice: 'bf_emma' }),
            ).rejects.toBeInstanceOf(ModelRefusalError);

            const { body } = await t.http.get('/api/testing/fake-gateway/calls').expect(200);
            expect(body.calls).toEqual([
                { method: 'synthesizeSpeech', request: { kind: 'read_aloud', text: 'Rain.', voice: 'bf_emma' } },
                { method: 'synthesizeSpeech', request: { kind: 'read_aloud', text: 'Sea.', voice: 'bf_emma' } },
            ]);
        });

        it('plays scripted audio sent as base64 over HTTP', async () => {
            const longer = silentMp3(40);
            await t.http
                .post('/api/testing/fake-gateway/speech')
                .send({ kind: 'voice_preview', replies: [{ audioBase64: longer.toString('base64') }] })
                .expect(204);

            const result = await t.gateway.synthesizeSpeech({ kind: 'voice_preview', text: 'Sample.', voice: 'af_sky' });

            expect(Buffer.compare(result.audio.bytes, longer)).toBe(0);
            expect(result.audio.mimeType).toBe('audio/mpeg');
        });
    });
});

import {
    ModelRefusalError,
    OutOfCreditError,
} from '../src/errors/model-gateway.errors.js';
import { FAKE_PNG, FAKE_TEXT_MODEL } from '../src/service/model-gateway/fake-model-gateway.js';
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
});

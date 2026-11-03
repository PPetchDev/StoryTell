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
});

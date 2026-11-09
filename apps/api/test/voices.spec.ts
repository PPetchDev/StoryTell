import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { OutOfCreditError } from '../src/errors/model-gateway.errors.js';
import { FAKE_MP3, FAKE_SPEECH_VOICES, silentMp3 } from '../src/service/model-gateway/fake-model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

const SAMPLE_TEXT = 'The lamp went out an hour ago, and the sea kept talking.';
const UNKNOWN_VOICE = '422.003.021';

interface Story {
    id: number;
    narrationVoice: string | null;
    characters: Array<{ id: number; name: string; speakingVoice: string | null }>;
}

/** Reads an audio answer's body as bytes; supertest leaves binary bodies alone only when asked. */
function binary(res: { on: (event: string, listener: (chunk?: Buffer) => void) => void }, done: (error: Error | null, body: Buffer) => void) {
    const chunks: Buffer[] = [];
    res.on('data', (chunk) => chunks.push(chunk!));
    res.on('end', () => done(null, Buffer.concat(chunks)));
}

// .scratch/read-aloud/spec.md, "Voices on the Story and its Characters".
describe('Voices', () => {
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

    async function storyWithMira(): Promise<Story> {
        const { body: created } = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const { body } = await t.http.post(`/api/stories/${created.id}/characters`).send({ name: 'Mira', voice: 'Short sentences.' }).expect(201);
        return body;
    }

    it('lists the English voices and the default Narration voice without a paid call', async () => {
        const { body } = await t.http.get('/api/voices').expect(200);

        expect(body).toEqual({ voices: FAKE_SPEECH_VOICES, defaultNarrationVoice: 'af_sky' });
        expect(t.gateway.calls).toEqual([]);
    });

    describe('on the Story and its Characters', () => {
        it('starts with no voices: the default Narration voice, and Characters read in it', async () => {
            const story = await storyWithMira();

            expect(story.narrationVoice).toBeNull();
            expect(story.characters[0].speakingVoice).toBeNull();
        });

        it('sets and clears the Narration voice', async () => {
            const story = await storyWithMira();

            const { body: set } = await t.http.patch(`/api/stories/${story.id}`).send({ narrationVoice: 'bm_george' }).expect(200);
            expect(set.narrationVoice).toBe('bm_george');
            // Another field saved alone leaves the voice as it was.
            await t.http.patch(`/api/stories/${story.id}`).send({ title: 'Renamed' }).expect(200);
            expect((await t.http.get(`/api/stories/${story.id}`).expect(200)).body.narrationVoice).toBe('bm_george');

            const { body: cleared } = await t.http.patch(`/api/stories/${story.id}`).send({ narrationVoice: null }).expect(200);
            expect(cleared.narrationVoice).toBeNull();
        });

        it('sets and clears a Speaking voice, apart from the Voice field', async () => {
            const story = await storyWithMira();
            const mira = story.characters[0];

            const { body: set } = await t.http
                .patch(`/api/stories/${story.id}/characters/${mira.id}`)
                .send({ speakingVoice: 'bf_emma' })
                .expect(200);
            expect(set.characters[0]).toMatchObject({ speakingVoice: 'bf_emma', voice: 'Short sentences.' });

            const { body: cleared } = await t.http
                .patch(`/api/stories/${story.id}/characters/${mira.id}`)
                .send({ speakingVoice: null })
                .expect(200);
            expect(cleared.characters[0]).toMatchObject({ speakingVoice: null, voice: 'Short sentences.' });
        });

        it('refuses a voice that is not in the list, changing nothing', async () => {
            const story = await storyWithMira();
            await t.http.patch(`/api/stories/${story.id}`).send({ narrationVoice: 'am_adam' }).expect(200);

            for (const voice of ['af_nobody', 'ef_dora', '']) {
                const { body } = await t.http
                    .patch(`/api/stories/${story.id}`)
                    .send({ narrationVoice: voice, title: 'Not saved' })
                    .expect(422);
                expect(body.error.code).toBe(UNKNOWN_VOICE);
            }
            const { body } = await t.http
                .patch(`/api/stories/${story.id}/characters/${story.characters[0].id}`)
                .send({ speakingVoice: 'zz_unknown' })
                .expect(422);
            expect(body.error.code).toBe(UNKNOWN_VOICE);

            const { body: after } = await t.http.get(`/api/stories/${story.id}`).expect(200);
            expect(after).toMatchObject({ title: 'The Lighthouse', narrationVoice: 'am_adam' });
            expect(after.characters[0].speakingVoice).toBeNull();
        });

        it('refuses a voice that is not a string', async () => {
            const story = await storyWithMira();
            await t.http.patch(`/api/stories/${story.id}`).send({ narrationVoice: 3 }).expect(400);
        });

        it('copies the Narration voice and every Speaking voice on Duplicate', async () => {
            const story = await storyWithMira();
            await t.http.post(`/api/stories/${story.id}/characters`).send({ name: 'Tomas' }).expect(201);
            const { body: withTomas } = await t.http.get(`/api/stories/${story.id}`).expect(200);
            await t.http.patch(`/api/stories/${story.id}`).send({ narrationVoice: 'bm_george' }).expect(200);
            await t.http.patch(`/api/stories/${story.id}/characters/${withTomas.characters[0].id}`).send({ speakingVoice: 'bf_emma' }).expect(200);

            const { body: copy } = await t.http.post(`/api/stories/${story.id}/duplicate`).expect(201);

            expect(copy.narrationVoice).toBe('bm_george');
            expect(copy.characters.map((character: Story['characters'][number]) => [character.name, character.speakingVoice])).toEqual([
                ['Mira', 'bf_emma'],
                ['Tomas', null],
            ]);
        });
    });

    describe('samples', () => {
        it('makes a voice sample once, keeps it in samples/, and serves it from disk after that', async () => {
            t.gateway.scriptSpeech('voice_preview', {});

            const first = await t.http.post('/api/voices/bf_emma/preview').buffer(true).parse(binary).expect(200);
            expect(first.headers['content-type']).toMatch(/^audio\/mpeg/);
            expect(Buffer.compare(first.body, FAKE_MP3.bytes)).toBe(0);
            expect(t.gateway.speechCalls()).toEqual([{ kind: 'voice_preview', text: SAMPLE_TEXT, voice: 'bf_emma' }]);
            expect(Buffer.compare(await readFile(path.join(t.speechDir, 'samples', 'bf_emma.mp3')), FAKE_MP3.bytes)).toBe(0);

            const again = await t.http.post('/api/voices/bf_emma/preview').buffer(true).parse(binary).expect(200);
            expect(Buffer.compare(again.body, FAKE_MP3.bytes)).toBe(0);
            expect(t.gateway.speechCalls()).toHaveLength(1);
        });

        it('makes each voice its own sample', async () => {
            const george = silentMp3(3);
            t.gateway.scriptSpeech('voice_preview', { audio: { bytes: george, mimeType: 'audio/mpeg' } });

            const { body } = await t.http.post('/api/voices/bm_george/preview').buffer(true).parse(binary).expect(200);

            expect(Buffer.compare(body, george)).toBe(0);
            expect(t.gateway.speechCalls().map((call) => call.voice)).toEqual(['bm_george']);
        });

        it('refuses an unknown voice with no call', async () => {
            const { body } = await t.http.post('/api/voices/xx_nobody/preview').expect(422);

            expect(body.error.code).toBe(UNKNOWN_VOICE);
            expect(t.gateway.calls).toEqual([]);
        });

        it('refuses a new sample with no call while the Venice pool is out, and still plays a kept one', async () => {
            t.gateway.scriptSpeech('voice_preview', {});
            await t.http.post('/api/voices/am_adam/preview').expect(200);
            t.gateway.reset();
            t.gateway.setRemainingCredit({ image: { remainingUsd: 0, limitUsd: 8 } });

            const { body } = await t.http.post('/api/voices/af_sky/preview').expect(402);
            expect(body.error.code).toBe('402.001.004');
            await t.http.post('/api/voices/am_adam/preview').expect(200);
            expect(t.gateway.speechCalls()).toEqual([]);
        });

        it('keeps nothing when the call fails', async () => {
            t.gateway.scriptSpeech('voice_preview', new OutOfCreditError('image'));

            const { body } = await t.http.post('/api/voices/af_sky/preview').expect(402);

            expect(body.error.code).toBe('402.001.004');
            expect(existsSync(path.join(t.speechDir, 'samples', 'af_sky.mp3'))).toBe(false);
        });
    });

    describe('test apps', () => {
        it('each get a speech folder of their own, removed on close', async () => {
            const other = await startTestApp();
            const otherDir = other.speechDir;
            try {
                expect(otherDir).not.toBe(t.speechDir);
                expect(path.basename(otherDir)).toMatch(/^storytell-speech-/);
                expect(existsSync(otherDir)).toBe(true);
            } finally {
                await other.close();
            }
            expect(existsSync(otherDir)).toBe(false);
            expect(existsSync(t.speechDir)).toBe(true);
        });
    });
});

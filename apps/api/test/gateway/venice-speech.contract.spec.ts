import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ModelRefusalError, OutOfCreditError, ProviderOutageError } from '../../src/errors/model-gateway.errors.js';
import { SpeechRequest } from '../../src/service/model-gateway/model-gateway.js';
import { gatewayUnderTest } from '../harness/gateway-under-test.js';
import { recordedFetch, RecordedResponse } from '../harness/recorded-fetch.js';

const BASE = 'https://api.venice.ai/api/v1';

/** Two silent MPEG frames: a synthetic answer, never real speech. */
const MP3 = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/venice/speech.mp3'));

const ttsModels: RecordedResponse = { fixture: 'venice/models-tts.json' };
const spoken: RecordedResponse = { bytes: MP3, contentType: 'audio/mpeg' };

function reading(overrides: Partial<SpeechRequest> = {}): SpeechRequest {
    return {
        kind: 'read_aloud',
        text: 'The lamp went out.',
        voice: 'af_test',
        servedFor: { storyId: 4, chatId: 9 },
        ...overrides,
    };
}

// .scratch/read-aloud/spec.md, "Provider and the Model Gateway". The request fields and the
// models list's shape follow https://docs.venice.ai/api-reference/endpoint/audio/speech and
// `GET /models?type=tts` (read 2026-11-09); the fixtures are synthetic.
describe('Venice contract: speech', () => {
    it('sends Kokoro the text, the voice, mp3 and speed 1, and answers the bytes as audio/mpeg', async () => {
        const net = recordedFetch([ttsModels, spoken]);
        const { gateway } = gatewayUnderTest(net.fetch);

        const result = await gateway.synthesizeSpeech(reading());

        expect(net.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
            `GET ${BASE}/models?type=tts`,
            `POST ${BASE}/audio/speech`,
        ]);
        const request = net.requests[1];
        expect(request.headers.Authorization).toMatch(/^Bearer /);
        expect(request.headers['Content-Type']).toBe('application/json');
        expect(request.body).toEqual({
            model: 'tts-kokoro',
            input: 'The lamp went out.',
            voice: 'af_test',
            response_format: 'mp3',
            speed: 1,
        });
        expect(result.audio.mimeType).toBe('audio/mpeg');
        expect(Buffer.compare(result.audio.bytes, MP3)).toBe(0);
        expect(result.model).toBe('kokoro');
        expect(result.characters).toBe(18);
    });

    it("records one Venice-pool UsageRecord with the characters sent, at the list price from pricing.input", async () => {
        const net = recordedFetch([ttsModels, spoken]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        // 18 characters at the fixture's $4 per million: $0.000072.
        const result = await gateway.synthesizeSpeech(reading({ kind: 'voice_preview', servedFor: undefined }));

        expect(result.costUsd).toBe(0.000072);
        expect(records).toEqual([
            {
                kind: 'voice_preview',
                pool: 'image',
                model: 'kokoro',
                host: 'venice',
                promptTokens: null,
                completionTokens: null,
                images: null,
                characters: 18,
                costUsd: 0.000072,
                storyId: null,
                chatId: null,
            },
        ]);
    });

    it('reads the models list once per process', async () => {
        const net = recordedFetch([ttsModels, spoken, spoken]);
        const { gateway } = gatewayUnderTest(net.fetch);

        await gateway.synthesizeSpeech(reading());
        await gateway.synthesizeSpeech(reading());
        await gateway.speechVoices();

        expect(net.requests.filter((request) => request.url.includes('/models'))).toHaveLength(1);
    });

    it('lists only the English voices, labelled from their ids', async () => {
        const net = recordedFetch([ttsModels]);
        const { gateway } = gatewayUnderTest(net.fetch);

        expect(await gateway.speechVoices()).toEqual([
            { id: 'af_test', label: 'Test — American, female', accent: 'american', gender: 'female' },
            { id: 'am_probe', label: 'Probe — American, male', accent: 'american', gender: 'male' },
            { id: 'bf_sample', label: 'Sample — British, female', accent: 'british', gender: 'female' },
            { id: 'bm_fixture', label: 'Fixture — British, male', accent: 'british', gender: 'male' },
        ]);
    });

    it('falls back to the stored voices and price when the models list fails, and asks again next time', async () => {
        const net = recordedFetch([{ status: 500, json: { error: 'Down' } }, spoken, ttsModels]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        // 18 characters at the stored $3.50 per million: $0.000063.
        const result = await gateway.synthesizeSpeech(reading({ voice: 'af_sky' }));
        expect(result.costUsd).toBe(0.000063);
        expect(records[0].costUsd).toBe(0.000063);

        const voices = await gateway.speechVoices();
        expect(voices.map((voice) => voice.id)).toEqual(['af_test', 'am_probe', 'bf_sample', 'bm_fixture']);
        expect(net.requests.filter((request) => request.url.includes('/models'))).toHaveLength(2);
    });

    it("answers the stored English voices when the models list can't be read", async () => {
        const net = recordedFetch([{ status: 500, json: {} }]);
        const { gateway } = gatewayUnderTest(net.fetch);

        const voices = await gateway.speechVoices();

        expect(net.requests).toHaveLength(1);
        expect(voices.length).toBeGreaterThan(20);
        expect(voices.find((voice) => voice.id === 'af_sky')).toEqual({
            id: 'af_sky',
            label: 'Sky — American, female',
            accent: 'american',
            gender: 'female',
        });
        expect(voices.every((voice) => /^[ab][fm]_/.test(voice.id))).toBe(true);
        expect(voices.some((voice) => voice.accent === 'british' && voice.gender === 'male')).toBe(true);
    });

    it('refuses text over the request limit before sending anything', async () => {
        const net = recordedFetch([]);
        const { gateway } = gatewayUnderTest(net.fetch);

        await expect(gateway.synthesizeSpeech(reading({ text: 'a'.repeat(4097) }))).rejects.toBeInstanceOf(RangeError);
        expect(net.requests).toHaveLength(0);
    });

    it('maps a 402 to the Venice pool being out, with one speech request and no record', async () => {
        const net = recordedFetch([ttsModels, { status: 402, json: { error: 'Insufficient balance' } }]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        const error = await gateway.synthesizeSpeech(reading()).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(OutOfCreditError);
        expect((error as OutOfCreditError).pool).toBe('image');
        expect(net.requests).toHaveLength(2);
        expect(records).toEqual([]);
    });

    it('maps a 422 to a refusal, not retried', async () => {
        const net = recordedFetch([ttsModels, { status: 422, json: { error: 'Rejected' } }]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        await expect(gateway.synthesizeSpeech(reading())).rejects.toBeInstanceOf(ModelRefusalError);
        expect(net.requests).toHaveLength(2);
        expect(records).toEqual([]);
    });

    it.each([400, 500])("maps a %i to an outage carrying Venice's message, not retried", async (status) => {
        const net = recordedFetch([ttsModels, { status, json: { error: 'Voice not found' } }]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        const error = await gateway.synthesizeSpeech(reading()).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(ProviderOutageError);
        expect((error as Error).message).toContain('Voice not found');
        expect(net.requests).toHaveLength(2);
        expect(records).toEqual([]);
    });

    it.each([429, 503])('retries a %i on the same model, and records the one answered call', async (status) => {
        const net = recordedFetch([ttsModels, { status, json: { error: 'Busy' } }, spoken]);
        const { gateway, records, sleeps } = gatewayUnderTest(net.fetch);

        const result = await gateway.synthesizeSpeech(reading());

        expect(Buffer.compare(result.audio.bytes, MP3)).toBe(0);
        expect(net.requests).toHaveLength(3);
        expect(net.requests[2].body.model).toBe('tts-kokoro');
        expect(sleeps).toHaveLength(1);
        expect(records).toHaveLength(1);
    });

    it('reads an answer that is not audio as unreadable', async () => {
        const net = recordedFetch([ttsModels, { json: { ok: true } }]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        await expect(gateway.synthesizeSpeech(reading())).rejects.toThrow(/no audio/);
        expect(records).toEqual([]);
    });
});

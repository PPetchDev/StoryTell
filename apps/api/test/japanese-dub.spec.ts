import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { buildDubTranslationPrompt, deliveryFor, EMOTION_DELIVERY, readDubTranslation } from '../src/manager/read-aloud/dub.js';
import { EMOTIONS } from '../src/model/story/emotion.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * A Japanese dub (.scratch/japanese-dub/spec.md): with the Story's Read aloud language set to
 * Japanese, a Message's queue is translated once, kept, and read with a Character's words in
 * Qwen 3 in their Japanese voice with their line's emotion, and narration in a Japanese Kokoro voice.
 */

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: *smiles* Boots off, keeper.';
const JAPANESE = '{"lines": ["ランプが消えて一時間。", "微笑む", "靴を脱いで、番人さん。"]}';

function binary(res: { on: (event: string, listener: (chunk?: Buffer) => void) => void }, done: (error: Error | null, body: Buffer) => void) {
    const chunks: Buffer[] = [];
    res.on('data', (chunk) => chunks.push(chunk!));
    res.on('end', () => done(null, Buffer.concat(chunks)));
}

describe('Japanese dub: the prompts', () => {
    it('says every emotion its own way, and an untagged line naturally', () => {
        expect(Object.keys(EMOTION_DELIVERY).sort()).toEqual([...EMOTIONS].sort());
        expect(deliveryFor(null)).toBe(EMOTION_DELIVERY.neutral);
        expect(deliveryFor('teasing')).toContain('teasing');
    });

    it('numbers the items with their speakers, and asks for adult, spoken Japanese as JSON', () => {
        const { messages } = buildDubTranslationPrompt([
            { text: 'The lamp went out.', speaker: null },
            { text: 'Boots off, keeper.', speaker: 'Mira' },
        ]);
        expect(messages[1].content).toBe('1. The lamp went out.\n2. [Mira] Boots off, keeper.');
        expect(messages[0].content).toContain('Every character is an adult');
        expect(messages[0].content).toContain('{"lines": ["...", "..."]}');
    });

    it('takes one non-empty line per item, and nothing else', () => {
        expect(readDubTranslation('Here: {"lines": ["a", "b"]}', 2)).toEqual(['a', 'b']);
        expect(readDubTranslation('{"lines": ["a"]}', 2)).toBeNull();
        expect(readDubTranslation('{"lines": ["a", " "]}', 2)).toBeNull();
        expect(readDubTranslation('no json', 1)).toBeNull();
    });
});

describe('Japanese dub (HTTP)', () => {
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

    async function createChat(): Promise<{ storyId: number; chatId: number; openingId: number; miraId: number }> {
        const { body: created } = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const { body: story } = await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' }).expect(201);
        const miraId = story.characters[0].id as number;
        const { body: chat } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return { storyId, chatId: chat.id, openingId: chat.messages[0].id, miraId };
    }

    const base = (storyId: number, chatId: number, messageId: number) => `/api/stories/${storyId}/chats/${chatId}/messages/${messageId}/speech`;
    const read = (storyId: number, chatId: number, messageId: number, index: number) => t.http.post(`${base(storyId, chatId, messageId)}/${index}`).buffer(true).parse(binary);

    it('sets the language and the Japanese voices on the Story and its Characters, refusing an unknown one', async () => {
        const { storyId, miraId } = await createChat();
        const { body: story } = await t.http.get(`/api/stories/${storyId}`).expect(200);
        expect(story).toMatchObject({ readAloudLanguage: 'english', dubNarrationVoice: null });
        expect(story.characters[0].dubVoice).toBeNull();

        await t.http.patch(`/api/stories/${storyId}`).send({ readAloudLanguage: 'japanese', dubNarrationVoice: 'jm_kumo' }).expect(200);
        const { body: mira } = await t.http.patch(`/api/stories/${storyId}/characters/${miraId}`).send({ dubVoice: 'Vivian' }).expect(200);
        expect(mira).toMatchObject({ readAloudLanguage: 'japanese', dubNarrationVoice: 'jm_kumo' });
        expect(mira.characters[0].dubVoice).toBe('Vivian');

        await t.http.patch(`/api/stories/${storyId}`).send({ readAloudLanguage: 'french' }).expect(400);
        expect((await t.http.patch(`/api/stories/${storyId}/characters/${miraId}`).send({ dubVoice: 'af_sky' }).expect(422)).body.error.code).toBe('422.003.021');
        expect((await t.http.patch(`/api/stories/${storyId}`).send({ dubNarrationVoice: 'Ono_Anna' }).expect(422)).body.error.code).toBe('422.003.021');

        // Duplicate keeps them.
        const { body: copy } = await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201);
        expect(copy).toMatchObject({ readAloudLanguage: 'japanese', dubNarrationVoice: 'jm_kumo' });
        expect(copy.characters[0].dubVoice).toBe('Vivian');
    });

    it('translates the queue once, reads the words in Qwen 3 with the emotion and the rest in Japanese Kokoro, and keeps it all', async () => {
        const { storyId, chatId, openingId } = await createChat();
        await t.http.patch(`/api/stories/${storyId}`).send({ readAloudLanguage: 'japanese' }).expect(200);

        const { body: queue } = await t.http.get(base(storyId, chatId, openingId)).expect(200);
        expect(queue.items.map((item: { voice: string }) => item.voice)).toEqual(['jf_alpha', 'jf_alpha', 'Ono_Anna']);

        t.gateway.scriptText('dub_translation', JAPANESE);
        t.gateway.scriptSpeech('read_aloud', {}, {}, {});
        for (const index of [0, 1, 2]) await read(storyId, chatId, openingId, index).expect(200);

        // One translation, of every item with its speaker.
        const translations = t.gateway.textCalls('dub_translation');
        expect(translations).toHaveLength(1);
        expect(translations[0].messages[1].content).toBe('1. The lamp went out an hour ago.\n2. smiles\n3. [Mira] Boots off, keeper.');
        expect(translations[0].servedFor).toEqual({ storyId, chatId });

        const speech = t.gateway.speechCalls('read_aloud');
        expect(speech.map((call) => [call.text, call.voice, call.model ?? 'kokoro'])).toEqual([
            ['ランプが消えて一時間。', 'jf_alpha', 'kokoro'],
            ['微笑む', 'jf_alpha', 'kokoro'],
            ['靴を脱いで、番人さん。', 'Ono_Anna', 'qwen3'],
        ]);
        // The Opening's line is not judged: said naturally.
        expect(speech[2]).toMatchObject({ language: 'Japanese', prompt: EMOTION_DELIVERY.neutral });
        expect(speech[0].prompt).toBeUndefined();

        // Kept: a replay makes no call, and the queue says so.
        await read(storyId, chatId, openingId, 2).expect(200);
        expect(t.gateway.speechCalls('read_aloud')).toHaveLength(3);
        const { body: again } = await t.http.get(base(storyId, chatId, openingId)).expect(200);
        expect(again.items.every((item: { cached: boolean }) => item.cached)).toBe(true);
        const folder = path.join(t.speechDir, 'messages', String(openingId));
        expect(existsSync(folder)).toBe(true);
        expect((await readdir(folder)).filter((file) => file.startsWith('dub-ja-'))).toHaveLength(1);
    });

    it('back in English, reads as before, with the English audio it already had', async () => {
        const { storyId, chatId, openingId } = await createChat();
        t.gateway.scriptSpeech('read_aloud', {});
        await read(storyId, chatId, openingId, 0).expect(200);
        await t.http.patch(`/api/stories/${storyId}`).send({ readAloudLanguage: 'japanese' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}`).send({ readAloudLanguage: 'english' }).expect(200);

        const { body: queue } = await t.http.get(base(storyId, chatId, openingId)).expect(200);
        expect(queue.items[0]).toMatchObject({ voice: 'af_sky', cached: true });
        expect(t.gateway.textCalls('dub_translation')).toEqual([]);
    });

    it('an unreadable translation is an error, with no speech made and nothing kept', async () => {
        const { storyId, chatId, openingId } = await createChat();
        await t.http.patch(`/api/stories/${storyId}`).send({ readAloudLanguage: 'japanese' }).expect(200);
        t.gateway.scriptText('dub_translation', '{"lines": ["only one"]}');

        await read(storyId, chatId, openingId, 0).expect(502);
        expect(t.gateway.speechCalls('read_aloud')).toEqual([]);
    });

    it('samples a Japanese voice in Japanese, once', async () => {
        t.gateway.scriptSpeech('voice_preview', {});
        await t.http.post('/api/voices/Ono_Anna/preview').buffer(true).parse(binary).expect(200);
        await t.http.post('/api/voices/Ono_Anna/preview').buffer(true).parse(binary).expect(200);
        const calls = t.gateway.speechCalls('voice_preview');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ voice: 'Ono_Anna', model: 'qwen3', language: 'Japanese' });
        expect(calls[0].text).toMatch(/[ぁ-ん]/);
    });
});

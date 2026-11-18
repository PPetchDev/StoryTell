import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { DataSource } from 'typeorm';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { lightOf, outfitPrompt, placePrompt, relightPrompt, StageManagerService, stageKey } from '../src/manager/chat/stage/stage.service.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/dressed-stage/spec.md: places and outfits drawn as the Chat reaches them.

const NO_OPS = '{"operations":[]}';

interface Stage {
    placePicturePath: string | null;
    outfits: { characterId: number; sprites: { emotion: string; imagePath: string; cutOut: boolean }[] }[];
    drawing: number;
}

interface Chat {
    id: number;
    dressStage: boolean;
    stage: Stage | null;
    messages: { kind: string; judge?: { status: string } | null; memory?: { status: string } | null }[];
}

function judgement(fields: Record<string, unknown> = {}): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, ...fields });
}

function jpeg(label: string): Buffer {
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(label)]);
}

describe('The dressed stage: the prompts', () => {
    it('lights a place by the time of day, in three', () => {
        expect(['dawn', 'morning', 'noon', 'afternoon', null].map((time) => lightOf(time as never))).toEqual(['day', 'day', 'day', 'day', 'day']);
        expect(lightOf('evening')).toBe('evening');
        expect(lightOf('night')).toBe('night');
    });

    it('keys a place or outfit by its words, whatever the case and spacing', () => {
        expect(stageKey('  Nara’s   TENT ')).toBe('nara’s tent');
    });

    it('draws a place empty, in its light, in the story\'s world; another light is an edit of it', () => {
        const prompt = placePrompt('A camp on the endless steppe.', 'Nara’s tent', 'night');
        expect(prompt).toContain('Nara’s tent, in night');
        expect(prompt).toContain('no people and no characters');
        expect(prompt).toContain('A camp on the endless steppe.');
        expect(relightPrompt('evening')).toContain('Keep the same place, layout, objects, camera and art style exactly');
        expect(relightPrompt('evening')).toContain('warm evening light');
    });

    it('dresses the same adult in the outfit, keeping the pose, and leaves the card\'s clothing out', () => {
        const prompt = outfitPrompt({ name: 'Nara', appearance: 'Tall, in a linen dress.' }, 'a silk robe');
        expect(prompt).toContain('Nara, an adult');
        expect(prompt).toContain('Change only the clothing, to: a silk robe');
        expect(prompt).toContain('pose, full-body framing');
        expect(prompt).toContain('leave out any clothing it describes');
    });
});

describe('The dressed stage (HTTP)', () => {
    let t: TestApp;
    let stage: StageManagerService;

    beforeAll(async () => {
        t = await startTestApp();
        stage = t.app.get(StageManagerService);
    });

    beforeEach(async () => {
        for (const entry of await readdir(t.imageDir)) await rm(path.join(t.imageDir, entry), { recursive: true, force: true });
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createStory(): Promise<{ storyId: number; naraId: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Steppe' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A camp on the steppe.', opening: '@Nara: Stay a while.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A guest.' }).expect(200);
        const made = await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall, dark hair.', personality: 'Warm.', voice: 'Low.' }).expect(201);
        const naraId = made.body.characters[0].id as number;
        t.gateway.scriptImage('reference_image', ...[1, 2, 3].map(() => ({ image: { bytes: jpeg('nara'), mimeType: 'image/jpeg' } })));
        const round = await t.http.post(`/api/stories/${storyId}/characters/${naraId}/reference-image/candidates`).expect(201);
        await t.http.put(`/api/stories/${storyId}/characters/${naraId}/reference-image`).send({ candidateId: round.body.candidates[0].id }).expect(200);
        t.gateway.reset();
        return { storyId, naraId };
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
    }

    /** Plays a turn whose Judge gives `fields`, and waits for the judge and the stage. */
    async function play(storyId: number, chatId: number, judge: string): Promise<Chat> {
        t.gateway.scriptText('turn', { text: '@Nara: You came back.\n\n@Nara: Sit with me.', model: 'glm-5.3' });
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello.' }).expect(201);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(storyId, chatId);
            const last = chat.messages.at(-1)!;
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') break;
            if (Date.now() > deadline) throw new Error('did not settle');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await stage.idle(chatId);
        return getChat(storyId, chatId);
    }

    const DRESSED = judgement({
        details: { place: 'Nara’s tent', outfits: [{ character: 'Nara', outfit: 'a silk robe' }] },
        time_of_day: 'night',
        expressions: [{ line: 1, emotion: 'desire' }, { line: 2, emotion: 'neutral' }],
    });

    it('with the switch off, draws nothing and answers no stage', async () => {
        const { storyId } = await createStory();
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        // The Story has an Expression, so lines are tagged.
        await t.http.put(`/api/stories/${storyId}/characters/${(await t.http.get(`/api/stories/${storyId}`)).body.characters[0].id}/expressions/joy`).attach('image', jpeg('joy'), 'joy.jpg').expect(200);

        const chat = await play(storyId, chatId, DRESSED);
        expect(chat.dressStage).toBe(false);
        expect(chat.stage).toBeNull();
        expect(t.gateway.imageCalls()).toEqual([]);
    });

    it('with it on, draws the place in its light, the outfit cut out, and the emotion the line carried', async () => {
        const { storyId, naraId } = await createStory();
        await t.http.put(`/api/stories/${storyId}/characters/${naraId}/expressions/joy`).attach('image', jpeg('joy'), 'joy.jpg').expect(200);
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}`).send({ dressStage: true }).expect(200);
        await stage.idle(chatId);
        t.gateway.scriptImage('place_picture', { image: { bytes: jpeg('tent-night'), mimeType: 'image/jpeg' } });
        t.gateway.scriptImage('outfit_sprite', { image: { bytes: jpeg('robe'), mimeType: 'image/jpeg' } }, { image: { bytes: jpeg('robe-desire'), mimeType: 'image/jpeg' } });

        const chat = await play(storyId, chatId, DRESSED);

        const calls = t.gateway.imageCalls();
        expect(calls.map((call) => call.kind)).toEqual(['place_picture', 'outfit_sprite', 'image_cutout', 'outfit_sprite', 'image_cutout']);
        // The place from words; the outfit from the Reference image; the emotion from the outfit.
        expect(calls[0].referenceImages ?? []).toEqual([]);
        expect(calls[0].prompt).toContain('Nara’s tent, in night');
        expect(calls[1].referenceImages).toEqual([{ bytes: jpeg('nara'), mimeType: 'image/jpeg' }]);
        expect(calls[1].prompt).toContain('a silk robe');
        expect(calls[3].referenceImages).toEqual([{ bytes: jpeg('robe'), mimeType: 'image/jpeg' }]);
        expect(calls[3].servedFor).toEqual({ storyId, chatId });

        expect(chat.stage!.placePicturePath).toMatch(new RegExp(`^stage/story-${storyId}/place-[0-9a-f]+\\.jpg$`));
        expect(chat.stage!.drawing).toBe(0);
        expect(chat.stage!.outfits).toEqual([
            {
                characterId: naraId,
                sprites: [
                    { emotion: 'neutral', imagePath: expect.stringMatching(/-neutral-cutout-[0-9a-f]+\.png$/), cutOut: true },
                    { emotion: 'desire', imagePath: expect.stringMatching(/-desire-cutout-[0-9a-f]+\.png$/), cutOut: true },
                ],
            },
        ]);

        // The same place and outfit again: nothing more is drawn.
        await play(storyId, chatId, DRESSED);
        expect(t.gateway.imageCalls()).toHaveLength(5);
    });

    it('another light is drawn from the place\'s first picture; a failed drawing is left and the rest go on', async () => {
        const { storyId, naraId } = await createStory();
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}`).send({ dressStage: true }).expect(200);
        t.gateway.scriptImage('place_picture', { image: { bytes: jpeg('tent-day'), mimeType: 'image/jpeg' } }, { image: { bytes: jpeg('tent-evening'), mimeType: 'image/jpeg' } });
        t.gateway.scriptImage('outfit_sprite', new ProviderOutageError('Venice is down.'));

        const first = await play(storyId, chatId, judgement({ details: { place: 'Nara’s tent', outfits: [{ character: 'Nara', outfit: 'a silk robe' }] }, time_of_day: 'morning' }));
        expect(first.stage!.outfits).toEqual([]);
        const evening = await play(storyId, chatId, judgement({ time_of_day: 'evening' }));

        const places = t.gateway.imageCalls().filter((call) => call.kind === 'place_picture');
        expect(places).toHaveLength(2);
        expect(places[1].referenceImages).toEqual([{ bytes: jpeg('tent-day'), mimeType: 'image/jpeg' }]);
        expect(places[1].prompt).toContain('warm evening light');
        expect(evening.stage!.placePicturePath).not.toBe(first.stage!.placePicturePath);
        // The failed outfit is not tried again within half an hour.
        expect(t.gateway.imageCalls().filter((call) => call.kind === 'outfit_sprite')).toHaveLength(1);
        expect(naraId).toBeGreaterThan(0);
    });

    it('stops for the day once the Chat\'s stage spent a dollar', async () => {
        const { storyId } = await createStory();
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}`).send({ dressStage: true }).expect(200);
        t.gateway.scriptImage('place_picture', { image: { bytes: jpeg('a'), mimeType: 'image/jpeg' } }, { image: { bytes: jpeg('b'), mimeType: 'image/jpeg' } });

        await play(storyId, chatId, judgement({ details: { place: 'the river' } }));
        // What the river cost, as the real gateway records it: the fake records nothing.
        const db = t.app.get(DataSource);
        await db.query(
            `INSERT INTO "usage_record" ("kind", "pool", "model", "host", "images", "cost_usd", "story_id", "chat_id", "user_id") SELECT 'place_picture', 'image', 'seedream-v5-pro', 'venice', 1, 1.05, $1, $2, "user_id" FROM "story" WHERE "id" = $1`,
            [storyId, chatId],
        );
        await play(storyId, chatId, judgement({ details: { place: 'the hill' } }));

        expect(t.gateway.imageCalls().filter((call) => call.kind === 'place_picture')).toHaveLength(1);
    });

    it('deleting the Chat deletes its outfit pictures; the Story\'s place pictures stay for its other Chats', async () => {
        const { storyId } = await createStory();
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}`).send({ dressStage: true }).expect(200);
        t.gateway.scriptImage('place_picture', { image: { bytes: jpeg('tent'), mimeType: 'image/jpeg' } });
        t.gateway.scriptImage('outfit_sprite', { image: { bytes: jpeg('robe'), mimeType: 'image/jpeg' } });
        const chat = await play(storyId, chatId, judgement({ details: { place: 'Nara’s tent', outfits: [{ character: 'Nara', outfit: 'a silk robe' }] } }));
        const sprite = chat.stage!.outfits[0].sprites[0].imagePath;

        await t.http.delete(`/api/stories/${storyId}/chats/${chatId}`).expect(204);
        const files = (await readdir(t.imageDir, { recursive: true })).map((file) => String(file).split(path.sep).join('/'));
        expect(files).not.toContain(sprite);
        expect(files).toContain(chat.stage!.placePicturePath);

        await t.http.delete(`/api/stories/${storyId}`).expect(204);
        const left = (await readdir(t.imageDir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile());
        expect(left).toEqual([]);
    });
});

import { access, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { judgeDetailsSection } from '../src/manager/chat/details/details.js';
import { StageManagerService } from '../src/manager/chat/stage/stage.service.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/places-ahead/spec.md: a Story's places, named, described and drawn before play.

const NO_OPS = '{"operations":[]}';

interface Picture {
    status: string;
    imagePath: string | null;
}

interface Places {
    places: { id: number; name: string; looks: string; pictures: Record<'day' | 'evening' | 'night', Picture | null> }[];
    met: { key: string; pictures: Record<'day' | 'evening' | 'night', Picture | null> }[];
}

function jpeg(label: string): Buffer {
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(label)]);
}

const picture = (label: string) => ({ image: { bytes: jpeg(label), mimeType: 'image/jpeg' } });

const exists = (file: string) =>
    access(file).then(
        () => true,
        () => false,
    );

describe('Places drawn ahead: the Judge', () => {
    const details = { place: null, weather: null, outfits: [], goals: [] };

    it("names the Story's Places for the Judge to answer with, exactly", () => {
        const section = judgeDetailsSection(details, [], null, ["Rin's tree-house", 'The Crescent hearth']);
        expect(section).toContain(`Places rule: when the story is at one of the Story's Places, answer "place" with its name exactly as written here: "Rin's tree-house", "The Crescent hearth".`);
    });

    it('says nothing of Places when the Story has none', () => {
        expect(judgeDetailsSection(details, [])).not.toContain('Places rule');
    });
});

describe('Places drawn ahead (HTTP)', () => {
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

    async function createStory(): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title: 'The Moonwood' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A silver forest where a fox spirit is reborn.', opening: '@Nara: Stay a while.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Rin', description: 'A fox spirit.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall, dark hair.', personality: 'Warm.', voice: 'Low.' }).expect(201);
        return storyId;
    }

    const places = (storyId: number) => `/api/stories/${storyId}/places`;

    it('adds, changes and lists Places, and refuses one with no name or a name it has', async () => {
        const storyId = await createStory();
        const added = (await t.http.post(places(storyId)).send({ name: "  Rin's   tree-house ", looks: 'A house grown inside a silver tree.' }).expect(201)).body as Places;
        expect(added.places).toEqual([{ id: expect.any(Number), name: "Rin's tree-house", looks: 'A house grown inside a silver tree.', pictures: { day: null, evening: null, night: null } }]);
        expect(added.met).toEqual([]);

        const empty = await t.http.post(places(storyId)).send({ name: '   ' }).expect(422);
        expect(empty.body.error.code).toBe('422.003.161');
        const twice = await t.http.post(places(storyId)).send({ name: "RIN'S TREE-HOUSE" }).expect(422);
        expect(twice.body.error.code).toBe('422.003.161');

        const changed = (await t.http.patch(`${places(storyId)}/${added.places[0].id}`).send({ looks: 'Round windows, moss on the sills.' }).expect(200)).body as Places;
        expect(changed.places[0]).toMatchObject({ name: "Rin's tree-house", looks: 'Round windows, moss on the sills.' });
        expect(((await t.http.get(places(storyId)).expect(200)).body as Places).places).toHaveLength(1);
        await t.http.patch(`${places(storyId)}/999999`).send({ looks: 'x' }).expect(404);
    });

    it('draws day from the name, the looks and the Setting; evening is an edit of day; night waits for day', async () => {
        const storyId = await createStory();
        const { places: [house] } = (await t.http.post(places(storyId)).send({ name: "Rin's tree-house", looks: 'Round windows.' }).expect(201)).body as Places;
        const { places: [, camp] } = (await t.http.post(places(storyId)).send({ name: 'The camp' }).expect(201)).body as Places;
        t.gateway.scriptImage('place_picture', picture('house-day'), picture('house-evening'));

        const day = (await t.http.post(`${places(storyId)}/${house.id}/draw`).send({ light: 'day' }).expect(201)).body as Places;
        const evening = (await t.http.post(`${places(storyId)}/${house.id}/draw`).send({ light: 'evening' }).expect(201)).body as Places;

        const calls = t.gateway.imageCalls('place_picture');
        expect(calls).toHaveLength(2);
        expect(calls[0].prompt).toContain("Rin's tree-house: Round windows., in clear daylight");
        expect(calls[0].prompt).toContain('A silver forest where a fox spirit is reborn.');
        expect(calls[0].referenceImages ?? []).toEqual([]);
        expect(calls[0].servedFor).toEqual({ storyId });
        expect(calls[1].referenceImages).toEqual([{ bytes: jpeg('house-day'), mimeType: 'image/jpeg' }]);
        expect(day.places[0].pictures.day).toEqual({ status: 'ready', imagePath: expect.stringMatching(new RegExp(`^stage/story-${storyId}/place-[0-9a-f]+\\.jpg$`)) });
        expect(evening.places[0].pictures.evening).toMatchObject({ status: 'ready' });

        const refused = await t.http.post(`${places(storyId)}/${camp.id}/draw`).send({ light: 'night' }).expect(409);
        expect(refused.body.error.code).toBe('409.003.163');
        expect(t.gateway.imageCalls('place_picture')).toHaveLength(2);
    });

    it('draws again in place of the old picture, whose file goes', async () => {
        const storyId = await createStory();
        const { places: [house] } = (await t.http.post(places(storyId)).send({ name: 'The hut' }).expect(201)).body as Places;
        t.gateway.scriptImage('place_picture', picture('first'), picture('second'));
        const first = (await t.http.post(`${places(storyId)}/${house.id}/draw`).send({ light: 'day' }).expect(201)).body as Places;
        const firstPath = first.places[0].pictures.day!.imagePath!;

        const second = (await t.http.post(`${places(storyId)}/${house.id}/draw`).send({ light: 'day' }).expect(201)).body as Places;

        expect(second.places[0].pictures.day!.imagePath).not.toBe(firstPath);
        expect(await exists(path.join(t.imageDir, firstPath))).toBe(false);
        expect(await exists(path.join(t.imageDir, second.places[0].pictures.day!.imagePath!))).toBe(true);
    });

    it('a failed drawing keeps the picture it was replacing', async () => {
        const storyId = await createStory();
        const { places: [house] } = (await t.http.post(places(storyId)).send({ name: 'The hut' }).expect(201)).body as Places;
        t.gateway.scriptImage('place_picture', picture('first'));
        const first = (await t.http.post(`${places(storyId)}/${house.id}/draw`).send({ light: 'day' }).expect(201)).body as Places;
        t.gateway.scriptImage('place_picture', new ProviderOutageError('Venice: down'));

        await t.http.post(`${places(storyId)}/${house.id}/draw`).send({ light: 'day' }).expect((response) => expect(response.status).toBeGreaterThanOrEqual(500));

        const after = (await t.http.get(places(storyId)).expect(200)).body as Places;
        expect(after.places[0].pictures.day).toEqual(first.places[0].pictures.day);
    });

    it('play uses a Place drawn ahead: the Judge names it, in any case, and nothing is drawn again', async () => {
        const storyId = await createStory();
        const { places: [house] } = (await t.http.post(places(storyId)).send({ name: "Rin's tree-house" }).expect(201)).body as Places;
        t.gateway.scriptImage('place_picture', picture('house-day'));
        const drawn = (await t.http.post(`${places(storyId)}/${house.id}/draw`).send({ light: 'day' }).expect(201)).body as Places;
        t.gateway.reset();
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}`).send({ dressStage: true }).expect(200);
        await stage.idle(chatId);

        t.gateway.scriptText('turn', { text: '@Nara: You came back.', model: 'glm-5.3' });
        t.gateway.scriptText('judge', JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, details: { place: "rin's TREE-HOUSE", outfits: [] } }));
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello.' }).expect(201);
        for (let tries = 0; tries < 250; tries++) {
            const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
            if (chat.messages.at(-1).judge?.status !== 'pending') break;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await stage.idle(chatId);

        // The Judge was told the Place's name.
        const judge = t.gateway.textCalls('judge')[0];
        expect(JSON.stringify(judge.messages)).toContain(`answer \\"place\\" with its name exactly as written here: \\"Rin's tree-house\\"`);
        expect(t.gateway.imageCalls('place_picture')).toEqual([]);
        const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
        expect(chat.stage.placePicturePath).toBe(drawn.places[0].pictures.day!.imagePath);
    });

    it('with Dress the stage off, a Chat still shows a Place drawn ahead, with no outfits, and draws nothing', async () => {
        const storyId = await createStory();
        const { places: [house] } = (await t.http.post(places(storyId)).send({ name: "Rin's tree-house" }).expect(201)).body as Places;
        t.gateway.scriptImage('place_picture', picture('house-day'));
        const drawn = (await t.http.post(`${places(storyId)}/${house.id}/draw`).send({ light: 'day' }).expect(201)).body as Places;
        t.gateway.reset();
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        // Before the story is anywhere with a picture: no stage.
        expect((await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body.stage).toBeNull();

        t.gateway.scriptText('turn', { text: '@Nara: You came back.', model: 'glm-5.3' });
        t.gateway.scriptText('judge', JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, details: { place: "Rin's tree-house", outfits: [{ character: 'Nara', outfit: 'a silk robe' }] } }));
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello.' }).expect(201);
        for (let tries = 0; tries < 250; tries++) {
            const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
            if (chat.messages.at(-1).judge?.status !== 'pending') break;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await stage.idle(chatId);

        const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
        expect(chat.dressStage).toBe(false);
        expect(chat.stage).toMatchObject({ placePicturePath: drawn.places[0].pictures.day!.imagePath, outfits: [], outfitChanges: [], drawing: 0 });
        expect(t.gateway.imageCalls()).toEqual([]);
    });

    it('lists a place met in play, and Remove takes its pictures and files; removing a Place takes its own', async () => {
        const storyId = await createStory();
        const { places: [house] } = (await t.http.post(places(storyId)).send({ name: 'The hut' }).expect(201)).body as Places;
        t.gateway.scriptImage('place_picture', picture('hut'));
        const drawn = (await t.http.post(`${places(storyId)}/${house.id}/draw`).send({ light: 'day' }).expect(201)).body as Places;
        const hutFile = path.join(t.imageDir, drawn.places[0].pictures.day!.imagePath!);
        // A Chat met another place in play.
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}`).send({ dressStage: true }).expect(200);
        await stage.idle(chatId);
        t.gateway.scriptImage('place_picture', picture('stream'));
        t.gateway.scriptText('turn', { text: '@Nara: Here.', model: 'glm-5.3' });
        t.gateway.scriptText('judge', JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, details: { place: 'By the Stream', outfits: [] } }));
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello.' }).expect(201);
        for (let tries = 0; tries < 250; tries++) {
            const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
            if (chat.messages.at(-1).judge?.status !== 'pending') break;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        await stage.idle(chatId);

        const listed = (await t.http.get(places(storyId)).expect(200)).body as Places;
        expect(listed.met).toEqual([{ key: 'by the stream', pictures: { day: { status: 'ready', imagePath: expect.any(String) }, evening: null, night: null } }]);
        const streamFile = path.join(t.imageDir, listed.met[0].pictures.day!.imagePath!);

        const afterMet = (await t.http.post(`${places(storyId)}/met/remove`).send({ key: 'By the Stream' }).expect(201)).body as Places;
        expect(afterMet.met).toEqual([]);
        expect(await exists(streamFile)).toBe(false);

        const afterPlace = (await t.http.delete(`${places(storyId)}/${house.id}`).expect(200)).body as Places;
        expect(afterPlace.places).toEqual([]);
        expect(await exists(hutFile)).toBe(false);
    });
});

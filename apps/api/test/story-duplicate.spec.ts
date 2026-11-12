import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { startTestApp, TestApp } from './harness/test-app.js';
import { takeSnapshot } from './harness/snapshot.js';

interface Character {
    id: number;
    name: string;
    appearance: string;
    personality: string;
    voice: string;
    exampleLines: string[];
    background: string;
    secrets: string;
    arcDirections: string;
    referenceImagePath: string | null;
    portraitCrop: { x: number; y: number; size: number } | null;
}

interface Story {
    id: number;
    title: string;
    setting: string;
    opening: string;
    style: { pov: string; tense: string; replyLength: string; imageStyle: string };
    role: { id: number; name: string; description: string };
    characters: Character[];
    startingBonds: Array<{ id: number; fromCharacterId: number; toCharacterId: number | null; label: string; description: string }>;
    scenes: Array<{ id: number; name: string; situation: string; moveOnCondition: string }>;
    cover: {
        source: 'snapshot' | 'reference_image' | 'upload';
        imagePath: string;
        focus: { x: number; y: number } | null;
        snapshotId: number | null;
        characterId: number | null;
    } | null;
    playable: boolean;
}

const OPENING = `Rain hammers the gallery windows.

@Mira: You're late. Boots off, keeper.`;

function jpeg(label: string): Buffer {
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(label)]);
}

function png(label: string): Buffer {
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(label)]);
}

/** Everything the author wrote, without ids, image paths or Cover: what a copy must carry over. */
function authored(story: Story) {
    const names = new Map(story.characters.map((character) => [character.id, character.name]));
    return {
        setting: story.setting,
        opening: story.opening,
        style: story.style,
        role: { name: story.role.name, description: story.role.description },
        characters: story.characters.map(({ id: _id, referenceImagePath: _path, ...rest }) => rest),
        startingBonds: story.startingBonds.map((bond) => ({
            from: names.get(bond.fromCharacterId),
            to: bond.toCharacterId === null ? null : names.get(bond.toCharacterId),
            label: bond.label,
            description: bond.description,
        })),
        scenes: story.scenes.map(({ id: _id, ...rest }) => rest),
    };
}

// Spec: "Duplicate Story".
describe('Duplicate Story', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    beforeEach(async () => {
        for (const entry of await readdir(t.imageDir)) {
            await rm(path.join(t.imageDir, entry), { recursive: true, force: true });
        }
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function getStory(storyId: number): Promise<Story> {
        const { body } = await t.http.get(`/api/stories/${storyId}`).expect(200);
        return body as Story;
    }

    async function pickReferenceImage(storyId: number, characterId: number, label: string): Promise<void> {
        t.gateway.scriptImage('reference_image', ...[1, 2, 3].map(() => ({ image: { bytes: jpeg(label), mimeType: 'image/jpeg' } })));
        const round = await t.http.post(`/api/stories/${storyId}/characters/${characterId}/reference-image/candidates`).expect(201);
        await t.http
            .put(`/api/stories/${storyId}/characters/${characterId}/reference-image`)
            .send({ candidateId: round.body.candidates[0].id })
            .expect(200);
        t.gateway.reset();
    }

    /** A Story with every authored part filled in: Mira with a Reference image and Portrait, Kai without. */
    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const id = created.body.id as number;
        await t.http
            .patch(`/api/stories/${id}`)
            .send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING, pov: 'first', tense: 'present', replyLength: 'long', imageStyle: 'Ink wash' })
            .expect(200);
        await t.http.patch(`/api/stories/${id}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${id}/characters`)
            .send({
                name: 'Mira',
                appearance: 'Tall, grey eyes.',
                personality: 'Guarded.',
                voice: 'Short.',
                exampleLines: ['Boots off.'],
                background: 'Six years alone.',
                secrets: 'She let the lamp go out.',
                arcDirections: 'Learns to trust.',
            })
            .expect(201);
        const withKai = await t.http.post(`/api/stories/${id}/characters`).send({ name: 'Kai', appearance: 'Wiry.', personality: 'Nosy.', voice: 'Rambling.' }).expect(201);
        const [mira, kai] = (withKai.body as Story).characters;
        await pickReferenceImage(id, mira.id, 'mira');
        await t.http.put(`/api/stories/${id}/characters/${mira.id}/reference-image/portrait`).send({ x: 0.1, y: 0.2, size: 0.5 }).expect(200);
        await t.http.post(`/api/stories/${id}/starting-bonds`).send({ fromCharacterId: mira.id, toCharacterId: kai.id, label: 'wary', description: 'He talks too much.' }).expect(201);
        await t.http.post(`/api/stories/${id}/starting-bonds`).send({ fromCharacterId: kai.id, toCharacterId: null, label: 'curious' }).expect(201);
        await t.http.post(`/api/stories/${id}/scenes`).send({ name: 'Arrival', situation: 'Ash comes in from the rain.', moveOnCondition: 'Boots are off.' }).expect(201);
        await t.http.post(`/api/stories/${id}/scenes`).send({ name: 'The lamp', situation: 'They climb the tower.' }).expect(201);
        return getStory(id);
    }

    async function duplicate(storyId: number): Promise<Story> {
        const { body } = await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201);
        return body as Story;
    }

    async function startChatWithSnapshot(storyId: number): Promise<{ chatId: number; snapshotId: number }> {
        const chat = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        t.gateway.scriptText('snapshot_prompt', JSON.stringify({ in_frame: ['Mira'], scene: 'Mira at the window.' }));
        t.gateway.scriptImage('snapshot_image', { image: { bytes: jpeg('snap'), mimeType: 'image/jpeg' }, model: 'seedream-v4-edit', costUsd: 0.05 });
        await takeSnapshot(t.http, storyId, chat.body.id);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chat.body.id}/snapshots`).expect(200);
            if (body.jobs.length === 0 && body.snapshots.length > 0) return { chatId: chat.body.id, snapshotId: body.snapshots[0].id };
            if (Date.now() > deadline) throw new Error('The Snapshot was not stored in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    it('creates "<title> (copy)" with everything the author wrote, Characters, Bonds and Scenes remapped', async () => {
        const source = await createStory();

        const copy = await duplicate(source.id);

        expect(copy.id).not.toBe(source.id);
        expect(copy.title).toBe('The Lighthouse (copy)');
        expect(authored(copy)).toEqual(authored(source));
        expect(copy.playable).toBe(true);
        // New rows, not the source's.
        expect(copy.role.id).not.toBe(source.role.id);
        const sourceIds = new Set(source.characters.map((character) => character.id));
        expect(copy.characters.every((character) => !sourceIds.has(character.id))).toBe(true);
        expect(copy.startingBonds.every((bond) => !sourceIds.has(bond.fromCharacterId))).toBe(true);
        // The source is untouched.
        expect(await getStory(source.id)).toEqual(source);
    });

    it('copies each Reference image into a file of its own, so deleting either Story keeps the other\'s', async () => {
        const source = await createStory();
        const copy = await duplicate(source.id);
        const sourcePath = source.characters[0].referenceImagePath!;
        const copyPath = copy.characters[0].referenceImagePath!;

        expect(copyPath).toMatch(new RegExp(`^reference-images/story-${copy.id}/character-${copy.characters[0].id}-[0-9a-f]+\\.jpg$`));
        expect(copy.characters[1].referenceImagePath).toBeNull();
        expect(await readFile(path.join(t.imageDir, copyPath))).toEqual(await readFile(path.join(t.imageDir, sourcePath)));

        await t.http.delete(`/api/stories/${source.id}`).expect(204);
        await t.http.get(`/api/images/${copyPath}`).expect(200);

        const again = await duplicate(copy.id);
        await t.http.delete(`/api/stories/${copy.id}`).expect(204);
        await t.http.get(`/api/images/${again.characters[0].referenceImagePath}`).expect(200);
    });

    it('copies neither Chats nor Snapshots', async () => {
        const source = await createStory();
        await startChatWithSnapshot(source.id);

        const copy = await duplicate(source.id);

        expect((await t.http.get(`/api/stories/${copy.id}/chats`).expect(200)).body.chats).toEqual([]);
        expect((await t.http.get(`/api/stories/${copy.id}/gallery`).expect(200)).body.snapshots).toEqual([]);
    });

    describe('the Cover', () => {
        it('copies an uploaded Cover into its own file, with its focus', async () => {
            const source = await createStory();
            await t.http.put(`/api/stories/${source.id}/cover/upload`).attach('image', png('cover'), 'cover.png').expect(200);
            await t.http.put(`/api/stories/${source.id}/cover/focus`).send({ x: 0.3, y: 0.7 }).expect(200);
            const sourceCover = (await getStory(source.id)).cover!;

            const copy = await duplicate(source.id);

            expect(copy.cover).toMatchObject({ source: 'upload', focus: { x: 0.3, y: 0.7 }, snapshotId: null, characterId: null });
            expect(copy.cover!.imagePath).toMatch(new RegExp(`^covers/story-${copy.id}/cover-[0-9a-f]+\\.png$`));
            expect(await readFile(path.join(t.imageDir, copy.cover!.imagePath))).toEqual(png('cover'));

            await t.http.delete(`/api/stories/${source.id}`).expect(204);
            await t.http.get(`/api/images/${copy.cover!.imagePath}`).expect(200);
            await t.http.get(`/api/images/${sourceCover.imagePath}`).expect(404);
        });

        it('points a Reference image Cover at the copy\'s own Character', async () => {
            const source = await createStory();
            const mira = source.characters[0];
            await t.http.put(`/api/stories/${source.id}/cover`).send({ characterId: mira.id }).expect(200);

            const copy = await duplicate(source.id);

            expect(copy.cover).toEqual({
                source: 'reference_image',
                imagePath: copy.characters[0].referenceImagePath,
                focus: null,
                snapshotId: null,
                characterId: copy.characters[0].id,
            });
        });

        it('drops a Cover that is a Snapshot, since Snapshots are not copied', async () => {
            const source = await createStory();
            const { snapshotId } = await startChatWithSnapshot(source.id);
            await t.http.put(`/api/stories/${source.id}/cover`).send({ snapshotId }).expect(200);
            await t.http.put(`/api/stories/${source.id}/cover/focus`).send({ x: 0.1, y: 0.1 }).expect(200);

            const copy = await duplicate(source.id);

            expect(copy.cover).toBeNull();
            expect((await getStory(source.id)).cover).toMatchObject({ source: 'snapshot', snapshotId });
        });
    });

    it('goes without a Reference image whose file is missing, and without the Cover that showed it', async () => {
        const source = await createStory();
        const mira = source.characters[0];
        await t.http.put(`/api/stories/${source.id}/cover`).send({ characterId: mira.id }).expect(200);
        await rm(path.join(t.imageDir, mira.referenceImagePath!));

        const copy = await duplicate(source.id);

        expect(copy.characters.map((character) => character.referenceImagePath)).toEqual([null, null]);
        // A Portrait is a square of the Reference image, so it goes with it.
        expect(copy.characters[0].portraitCrop).toBeNull();
        expect(copy.cover).toBeNull();
    });

    it('answers 404 for a Story that does not exist', async () => {
        const { body } = await t.http.post('/api/stories/999999/duplicate').expect(404);
        expect(body.error.code).toBe('404.003.001');
    });
});

import pg from 'pg';

import { startTestApp, TestApp } from './harness/test-app.js';

interface Story {
    id: number;
    title: string;
    setting: string;
    opening: string;
    style: { pov: string; tense: string; replyLength: string; imageStyle: string };
    role: { id: number; name: string; description: string };
    characters: Array<{ id: number; name: string; exampleLines: string[] }>;
    startingBonds: Array<{ id: number; fromCharacterId: number; toCharacterId: number | null }>;
    scenes: Array<{ id: number; name: string; moveOnCondition: string }>;
    playable: boolean;
    missing: Array<{ field: string; label: string }>;
    updatedAt: string;
}

const fullCharacter = {
    name: 'Mira',
    appearance: 'Tall, grey eyes, a scar across one eyebrow.',
    personality: 'Guarded and dry, warms slowly.',
    voice: 'Short sentences. Never says please.',
};

describe('Story authoring', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createStory(title = 'Untitled'): Promise<Story> {
        const response = await t.http.post('/api/stories').send({ title }).expect(201);
        return response.body as Story;
    }

    async function patch(path: string, body: object): Promise<Story> {
        const response = await t.http.patch(path).send(body).expect(200);
        return response.body as Story;
    }

    async function addCharacter(storyId: number, fields: object = fullCharacter): Promise<Story> {
        const response = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send(fields)
            .expect(201);
        return response.body as Story;
    }

    /** A Story with every required field filled, and nothing optional. */
    async function createPlayableStory(): Promise<Story> {
        const story = await createStory('The Lighthouse');
        await patch(`/api/stories/${story.id}`, {
            setting: 'A lighthouse on a storm-cut island, 1890s.',
            opening: 'The lamp went out an hour ago.',
        });
        await patch(`/api/stories/${story.id}/role`, {
            name: 'The new keeper',
            description: 'Arrived this morning, knows nothing of the island.',
        });
        return addCharacter(story.id);
    }

    it('creates a Story with its Role and default Style, and lists it', async () => {
        const story = await createStory('First Light');

        expect(story.title).toBe('First Light');
        expect(story.role).toEqual({ id: expect.any(Number), name: '', description: '' });
        expect(story.style).toEqual({
            pov: 'second',
            tense: 'past',
            replyLength: 'medium',
            imageStyle: '',
        });
        expect(story.characters).toEqual([]);
        expect(story.scenes).toEqual([]);
        expect(story.startingBonds).toEqual([]);
        expect(story.playable).toBe(false);

        const list = await t.http.get('/api/stories').expect(200);
        expect(list.body.stories).toContainEqual(
            expect.objectContaining({ id: story.id, title: 'First Light', playable: false }),
        );
        const read = await t.http.get(`/api/stories/${story.id}`).expect(200);
        expect(read.body).toEqual(story);
    });

    it('answers 404.003.001 for a Story that does not exist', async () => {
        const response = await t.http.get('/api/stories/999999').expect(404);
        expect(response.body.error.code).toBe('404.003.001');
    });

    it('saves every Story, Style and Role field and rejects a Style value outside its set', async () => {
        const story = await createStory();
        const updated = await patch(`/api/stories/${story.id}`, {
            title: 'Renamed',
            setting: 'A city.',
            opening: 'Rain.',
            pov: 'first',
            tense: 'present',
            replyLength: 'long',
            imageStyle: 'anime, soft colours',
        });
        expect(updated).toMatchObject({
            title: 'Renamed',
            setting: 'A city.',
            opening: 'Rain.',
            style: { pov: 'first', tense: 'present', replyLength: 'long', imageStyle: 'anime, soft colours' },
        });

        const role = await patch(`/api/stories/${story.id}/role`, { name: 'Detective' });
        expect(role.role).toMatchObject({ name: 'Detective', description: '' });

        const bad = await t.http.patch(`/api/stories/${story.id}`).send({ pov: 'fourth' }).expect(400);
        expect(bad.body.error.code).toBe('400.000.000');
    });

    describe('playable status', () => {
        it('lists every missing required field on a fresh Story', async () => {
            const story = await createStory('');

            expect(story.playable).toBe(false);
            expect(story.missing.map((m) => m.field)).toEqual([
                'title',
                'setting',
                'opening',
                'role.name',
                'role.description',
                'characters',
            ]);
        });

        it('flips to playable exactly when the last required field is filled', async () => {
            const story = await createStory('The Lighthouse');
            await patch(`/api/stories/${story.id}`, { setting: 'An island.', opening: 'Dark.' });
            await patch(`/api/stories/${story.id}/role`, { name: 'Keeper', description: 'New.' });
            const withCharacter = await addCharacter(story.id, { ...fullCharacter, voice: '' });

            expect(withCharacter.playable).toBe(false);
            expect(withCharacter.missing).toEqual([
                { field: 'characters.0.voice', label: 'Mira: Voice' },
            ]);

            const characterId = withCharacter.characters[0].id;
            const filled = await patch(`/api/stories/${story.id}/characters/${characterId}`, {
                voice: 'Clipped.',
            });
            expect(filled.playable).toBe(true);
            expect(filled.missing).toEqual([]);

            const list = await t.http.get('/api/stories').expect(200);
            expect(list.body.stories).toContainEqual(
                expect.objectContaining({ id: story.id, playable: true }),
            );
        });

        it('flips back when a required field is emptied, and whitespace does not count', async () => {
            const story = await createPlayableStory();
            expect(story.playable).toBe(true);

            const emptied = await patch(`/api/stories/${story.id}/role`, { description: '   ' });
            expect(emptied.playable).toBe(false);
            expect(emptied.missing).toEqual([
                { field: 'role.description', label: 'Role: Description' },
            ]);

            const refilled = await patch(`/api/stories/${story.id}/role`, { description: 'Lost.' });
            expect(refilled.playable).toBe(true);
        });

        it('does not need the optional fields', async () => {
            const story = await createPlayableStory();
            expect(story.style.imageStyle).toBe('');
            expect(story.characters[0].exampleLines).toEqual([]);
            expect(story.scenes).toEqual([]);
            expect(story.playable).toBe(true);
        });
    });

    describe('Characters', () => {
        it('saves every Character field, example lines in order', async () => {
            const story = await createStory();
            const added = await addCharacter(story.id, {
                ...fullCharacter,
                exampleLines: ['Go away.', 'Fine. Stay.'],
                background: 'Born on the island.',
                secrets: 'She put the lamp out herself.',
                arcDirections: 'If trusted, her coldness thaws.',
            });

            expect(added.characters).toHaveLength(1);
            expect(added.characters[0]).toMatchObject({
                ...fullCharacter,
                exampleLines: ['Go away.', 'Fine. Stay.'],
                background: 'Born on the island.',
                secrets: 'She put the lamp out herself.',
                arcDirections: 'If trusted, her coldness thaws.',
            });

            const reordered = await patch(
                `/api/stories/${story.id}/characters/${added.characters[0].id}`,
                { exampleLines: ['Fine. Stay.', 'Go away.'] },
            );
            expect(reordered.characters[0].exampleLines).toEqual(['Fine. Stay.', 'Go away.']);
        });

        it('rejects a 7th Character with 422.003.005', async () => {
            const story = await createStory();
            for (let i = 1; i <= 6; i++) {
                await addCharacter(story.id, { name: `Character ${i}` });
            }

            const response = await t.http
                .post(`/api/stories/${story.id}/characters`)
                .send({ name: 'One too many' })
                .expect(422);

            expect(response.body.error.code).toBe('422.003.005');
            const read = await t.http.get(`/api/stories/${story.id}`).expect(200);
            expect(read.body.characters).toHaveLength(6);
        });

        it('removes a Character and its StartingBonds in both directions', async () => {
            const story = await createStory();
            await addCharacter(story.id, { name: 'A' });
            await addCharacter(story.id, { name: 'B' });
            let current = await addCharacter(story.id, { name: 'C' });
            const [a, b, c] = current.characters.map((character) => character.id);
            await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: a, toCharacterId: b, label: 'rival' })
                .expect(201);
            await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: c, toCharacterId: b, label: 'fond' })
                .expect(201);
            current = (
                await t.http
                    .post(`/api/stories/${story.id}/starting-bonds`)
                    .send({ fromCharacterId: a, toCharacterId: c, label: 'wary' })
                    .expect(201)
            ).body as Story;
            expect(current.startingBonds).toHaveLength(3);

            const removed = (
                await t.http.delete(`/api/stories/${story.id}/characters/${b}`).expect(200)
            ).body as Story;

            expect(removed.characters.map((character) => character.name)).toEqual(['A', 'C']);
            expect(removed.startingBonds).toEqual([
                expect.objectContaining({ fromCharacterId: a, toCharacterId: c, label: 'wary' }),
            ]);
        });
    });

    describe('StartingBonds', () => {
        it('rejects a second StartingBond in the same direction with 409.003.006', async () => {
            const story = await createStory();
            await addCharacter(story.id, { name: 'Mira' });
            const withTwo = await addCharacter(story.id, { name: 'Tomas' });
            const [mira, tomas] = withTwo.characters.map((character) => character.id);

            // Toward the Role, toward Tomas, and Tomas back toward Mira are three directions.
            await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: mira, toCharacterId: null, label: 'suspicious' })
                .expect(201);
            await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: mira, toCharacterId: tomas, label: 'protective' })
                .expect(201);
            await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: tomas, toCharacterId: mira, label: 'in awe' })
                .expect(201);

            const towardRoleAgain = await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: mira, toCharacterId: null, label: 'curious' })
                .expect(409);
            expect(towardRoleAgain.body.error.code).toBe('409.003.006');

            const towardTomasAgain = await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: mira, toCharacterId: tomas, label: 'curious' })
                .expect(409);
            expect(towardTomasAgain.body.error.code).toBe('409.003.006');

            const read = await t.http.get(`/api/stories/${story.id}`).expect(200);
            expect(read.body.startingBonds).toHaveLength(3);
        });

        it('rejects a StartingBond toward the same Character or one from another Story', async () => {
            const story = await createStory();
            const withOne = await addCharacter(story.id, { name: 'Mira' });
            const mira = withOne.characters[0].id;
            const other = await addCharacter((await createStory()).id, { name: 'Elsewhere' });

            const self = await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: mira, toCharacterId: mira, label: 'self' })
                .expect(422);
            expect(self.body.error.code).toBe('422.003.007');

            const stranger = await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: mira, toCharacterId: other.characters[0].id })
                .expect(404);
            expect(stranger.body.error.code).toBe('404.003.002');
        });

        it('edits and removes a StartingBond', async () => {
            const story = await createStory();
            const withOne = await addCharacter(story.id, { name: 'Mira' });
            const created = (
                await t.http
                    .post(`/api/stories/${story.id}/starting-bonds`)
                    .send({ fromCharacterId: withOne.characters[0].id, toCharacterId: null })
                    .expect(201)
            ).body as Story;
            const bondId = created.startingBonds[0].id;

            const edited = await patch(`/api/stories/${story.id}/starting-bonds/${bondId}`, {
                label: 'wary',
                description: 'Keeps her distance.',
            });
            expect(edited.startingBonds[0]).toMatchObject({ label: 'wary', description: 'Keeps her distance.' });

            const removed = (
                await t.http.delete(`/api/stories/${story.id}/starting-bonds/${bondId}`).expect(200)
            ).body as Story;
            expect(removed.startingBonds).toEqual([]);
        });
    });

    describe('Scenes', () => {
        async function addScene(storyId: number, fields: object): Promise<Story> {
            const response = await t.http.post(`/api/stories/${storyId}/scenes`).send(fields).expect(201);
            return response.body as Story;
        }

        it('lets only the last Scene leave its move-on condition empty', async () => {
            const story = await createPlayableStory();

            const one = await addScene(story.id, { name: 'Arrival', situation: 'Reach the lamp room.' });
            expect(one.playable).toBe(true);

            const two = await addScene(story.id, { name: 'The lamp', situation: 'Light it.' });
            expect(two.playable).toBe(false);
            expect(two.missing).toEqual([
                { field: 'scenes.0.moveOnCondition', label: 'Arrival: Move-on condition' },
            ]);

            const filled = await patch(`/api/stories/${story.id}/scenes/${two.scenes[0].id}`, {
                moveOnCondition: 'Once Mira lets you up the stairs.',
            });
            expect(filled.playable).toBe(true);

            const swapped = (
                await t.http
                    .put(`/api/stories/${story.id}/scenes/order`)
                    .send({ sceneIds: [two.scenes[1].id, two.scenes[0].id] })
                    .expect(200)
            ).body as Story;
            expect(swapped.playable).toBe(false);
            expect(swapped.missing).toEqual([
                { field: 'scenes.0.moveOnCondition', label: 'The lamp: Move-on condition' },
            ]);
        });

        it('needs a name and situation on every Scene', async () => {
            const story = await createPlayableStory();
            const added = await addScene(story.id, {});
            expect(added.missing).toEqual([
                { field: 'scenes.0.name', label: 'Scene 1: Name' },
                { field: 'scenes.0.situation', label: 'Scene 1: Situation' },
            ]);
        });

        it('removes a Scene', async () => {
            const story = await createStory();
            await addScene(story.id, { name: 'One' });
            const two = await addScene(story.id, { name: 'Two' });
            const removed = (
                await t.http.delete(`/api/stories/${story.id}/scenes/${two.scenes[0].id}`).expect(200)
            ).body as Story;
            expect(removed.scenes.map((scene) => scene.name)).toEqual(['Two']);
        });
    });

    describe('reordering', () => {
        it('persists a new Character order', async () => {
            const story = await createStory();
            await addCharacter(story.id, { name: 'A' });
            await addCharacter(story.id, { name: 'B' });
            const three = await addCharacter(story.id, { name: 'C' });
            const [a, b, c] = three.characters.map((character) => character.id);

            const reordered = (
                await t.http
                    .put(`/api/stories/${story.id}/characters/order`)
                    .send({ characterIds: [c, a, b] })
                    .expect(200)
            ).body as Story;
            expect(reordered.characters.map((character) => character.name)).toEqual(['C', 'A', 'B']);

            const read = await t.http.get(`/api/stories/${story.id}`).expect(200);
            expect(read.body.characters.map((character: { name: string }) => character.name)).toEqual([
                'C',
                'A',
                'B',
            ]);
            // Adding after a reorder goes to the end.
            const four = await addCharacter(story.id, { name: 'D' });
            expect(four.characters.map((character) => character.name)).toEqual(['C', 'A', 'B', 'D']);
        });

        it('persists a new Scene order', async () => {
            const story = await createStory();
            await t.http.post(`/api/stories/${story.id}/scenes`).send({ name: 'One' }).expect(201);
            const two = await t.http.post(`/api/stories/${story.id}/scenes`).send({ name: 'Two' }).expect(201);
            const [one, second] = (two.body as Story).scenes.map((scene) => scene.id);

            await t.http
                .put(`/api/stories/${story.id}/scenes/order`)
                .send({ sceneIds: [second, one] })
                .expect(200);

            const read = await t.http.get(`/api/stories/${story.id}`).expect(200);
            expect(read.body.scenes.map((scene: { name: string }) => scene.name)).toEqual(['Two', 'One']);
        });

        it('rejects an order that is not every Character exactly once', async () => {
            const story = await createStory();
            await addCharacter(story.id, { name: 'A' });
            const two = await addCharacter(story.id, { name: 'B' });
            const [a, b] = two.characters.map((character) => character.id);

            for (const characterIds of [[a], [a, a], [a, b, 999999]]) {
                const response = await t.http
                    .put(`/api/stories/${story.id}/characters/order`)
                    .send({ characterIds })
                    .expect(422);
                expect(response.body.error.code).toBe('422.003.008');
            }
            const read = await t.http.get(`/api/stories/${story.id}`).expect(200);
            expect(read.body.characters.map((character: { name: string }) => character.name)).toEqual(['A', 'B']);
        });
    });

    describe('autosave', () => {
        it('bumps the Story\'s updatedAt on a change anywhere under it', async () => {
            const story = await createPlayableStory();
            await new Promise((resolve) => setTimeout(resolve, 20));

            const afterRole = await patch(`/api/stories/${story.id}/role`, { name: 'Keeper' });
            expect(Date.parse(afterRole.updatedAt)).toBeGreaterThan(Date.parse(story.updatedAt));

            await new Promise((resolve) => setTimeout(resolve, 20));
            const afterCharacter = await patch(
                `/api/stories/${story.id}/characters/${story.characters[0].id}`,
                { secrets: 'Knows the way down.' },
            );
            expect(Date.parse(afterCharacter.updatedAt)).toBeGreaterThan(Date.parse(afterRole.updatedAt));
        });
    });

    describe('delete', () => {
        it('removes the Story and everything under it, and nothing else', async () => {
            const keep = await createPlayableStory();
            const story = await createPlayableStory();
            const withTwo = await addCharacter(story.id, { name: 'Tomas' });
            const [mira, tomas] = withTwo.characters.map((character) => character.id);
            await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: mira, toCharacterId: tomas })
                .expect(201);
            await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: tomas, toCharacterId: null })
                .expect(201);
            await t.http.post(`/api/stories/${story.id}/scenes`).send({ name: 'One' }).expect(201);

            await t.http.delete(`/api/stories/${story.id}`).expect(204);

            const gone = await t.http.get(`/api/stories/${story.id}`).expect(404);
            expect(gone.body.error.code).toBe('404.003.001');
            const again = await t.http.delete(`/api/stories/${story.id}`).expect(404);
            expect(again.body.error.code).toBe('404.003.001');

            const client = new pg.Client({ connectionString: t.databaseUrl });
            await client.connect();
            try {
                for (const table of ['role', 'character', 'starting_bond', 'scene']) {
                    const { rows } = await client.query(
                        `SELECT count(*)::int AS n FROM "${table}" WHERE story_id = $1`,
                        [story.id],
                    );
                    expect({ table, rows: rows[0].n }).toEqual({ table, rows: 0 });
                }
            } finally {
                await client.end();
            }

            const kept = await t.http.get(`/api/stories/${keep.id}`).expect(200);
            expect(kept.body).toMatchObject({ id: keep.id, playable: true });
            expect(kept.body.characters).toHaveLength(1);
        });
    });
});

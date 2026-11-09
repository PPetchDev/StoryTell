import pg from 'pg';

import { startTestApp, TestApp } from './harness/test-app.js';

interface SavedReply {
    id: number;
    text: string;
}

interface Story {
    id: number;
    title: string;
    savedReplies: SavedReply[];
}

interface Chat {
    savedReplies: Array<SavedReply & { scope: 'story' | 'app' }>;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';

// .scratch/saved-replies-and-replace-rules/spec.md: "Saved replies: storage and API".
describe('Saved replies', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    beforeEach(async () => {
        // App-wide lines are shared by every test of this file.
        for (const line of (await t.http.get('/api/saved-replies').expect(200)).body.savedReplies as SavedReply[]) {
            await t.http.delete(`/api/saved-replies/${line.id}`).expect(200);
        }
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    /** A playable Story with Mira; the Role is Ash. */
    async function createStory(title = 'The Lighthouse'): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const { body } = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
            .expect(201);
        return body as Story;
    }

    async function addAppWide(text: string): Promise<SavedReply[]> {
        const { body } = await t.http.post('/api/saved-replies').send({ text }).expect(201);
        return body.savedReplies as SavedReply[];
    }

    async function addToStory(storyId: number, text: string): Promise<Story> {
        const { body } = await t.http.post(`/api/stories/${storyId}/saved-replies`).send({ text }).expect(201);
        return body as Story;
    }

    const texts = (lines: SavedReply[]) => lines.map((line) => line.text);

    describe('app-wide', () => {
        it('adds, lists in add order, edits and removes, each answering the app-wide list', async () => {
            expect(await addAppWide('  *leans back and listens*  ')).toEqual([{ id: expect.any(Number), text: '*leans back and listens*' }]);
            const lines = await addAppWide('What do you mean, {user}?');
            expect(texts(lines)).toEqual(['*leans back and listens*', 'What do you mean, {user}?']);

            const listed = await t.http.get('/api/saved-replies').expect(200);
            expect(listed.body.savedReplies).toEqual(lines);

            const edited = await t.http.patch(`/api/saved-replies/${lines[0].id}`).send({ text: '*nods slowly*' }).expect(200);
            expect(texts(edited.body.savedReplies)).toEqual(['*nods slowly*', 'What do you mean, {user}?']);

            const removed = await t.http.delete(`/api/saved-replies/${lines[0].id}`).expect(200);
            expect(texts(removed.body.savedReplies)).toEqual(['What do you mean, {user}?']);
        });

        it('refuses blank text, text over 1,000 characters, a 51st line and an unknown id', async () => {
            const blank = await t.http.post('/api/saved-replies').send({ text: '   ' }).expect(422);
            expect(blank.body.error.code).toBe('422.008.001');
            await t.http.post('/api/saved-replies').send({ text: 'x'.repeat(1_001) }).expect(400);
            await t.http.post('/api/saved-replies').send({ text: 'x'.repeat(1_000) }).expect(201);

            const [line] = (await t.http.get('/api/saved-replies').expect(200)).body.savedReplies as SavedReply[];
            const blankEdit = await t.http.patch(`/api/saved-replies/${line.id}`).send({ text: '' }).expect(422);
            expect(blankEdit.body.error.code).toBe('422.008.001');

            for (let index = 2; index <= 50; index++) await addAppWide(`Line ${index}`);
            const tooMany = await t.http.post('/api/saved-replies').send({ text: 'One more' }).expect(422);
            expect(tooMany.body.error.code).toBe('422.008.002');
            expect((await t.http.get('/api/saved-replies').expect(200)).body.savedReplies).toHaveLength(50);

            const unknown = await t.http.patch('/api/saved-replies/999999').send({ text: 'Hi' }).expect(404);
            expect(unknown.body.error.code).toBe('404.008.003');
            await t.http.delete('/api/saved-replies/999999').expect(404);
        });
    });

    describe("a Story's own", () => {
        it('adds, edits and removes, each answering the whole Story with its lines in add order', async () => {
            const story = await createStory();
            expect(story.savedReplies).toEqual([]);

            const first = await addToStory(story.id, ' I check the lamp. ');
            expect(first.title).toBe('The Lighthouse');
            expect(texts(first.savedReplies)).toEqual(['I check the lamp.']);
            const second = await addToStory(story.id, 'Any ships tonight?');
            expect(texts(second.savedReplies)).toEqual(['I check the lamp.', 'Any ships tonight?']);

            const [lamp, ships] = second.savedReplies;
            const edited = await t.http.patch(`/api/stories/${story.id}/saved-replies/${lamp.id}`).send({ text: 'I trim the wick.' }).expect(200);
            expect(texts(edited.body.savedReplies)).toEqual(['I trim the wick.', 'Any ships tonight?']);

            const removed = await t.http.delete(`/api/stories/${story.id}/saved-replies/${ships.id}`).expect(200);
            expect(texts(removed.body.savedReplies)).toEqual(['I trim the wick.']);
            expect(texts((await t.http.get(`/api/stories/${story.id}`).expect(200)).body.savedReplies)).toEqual(['I trim the wick.']);
        });

        it('keeps the scopes apart: an app-wide line is not a Story line, nor one of another Story', async () => {
            const story = await createStory();
            const other = await createStory('Other');
            const [appLine] = await addAppWide('Hello.');
            const [storyLine] = (await addToStory(story.id, 'Mine.')).savedReplies;

            const viaStory = await t.http.patch(`/api/stories/${story.id}/saved-replies/${appLine.id}`).send({ text: 'x' }).expect(404);
            expect(viaStory.body.error.code).toBe('404.008.003');
            await t.http.delete(`/api/stories/${other.id}/saved-replies/${storyLine.id}`).expect(404);
            await t.http.patch(`/api/saved-replies/${storyLine.id}`).send({ text: 'x' }).expect(404);
            expect(texts((await t.http.get('/api/saved-replies').expect(200)).body.savedReplies)).toEqual(['Hello.']);
        });

        it('refuses blank text and a 51st line, and answers 404 for an unknown Story', async () => {
            const story = await createStory();
            const blank = await t.http.post(`/api/stories/${story.id}/saved-replies`).send({ text: '\n ' }).expect(422);
            expect(blank.body.error.code).toBe('422.008.001');
            for (let index = 1; index <= 50; index++) await addToStory(story.id, `Line ${index}`);
            const tooMany = await t.http.post(`/api/stories/${story.id}/saved-replies`).send({ text: 'One more' }).expect(422);
            expect(tooMany.body.error.code).toBe('422.008.002');
            // The app-wide scope counts on its own.
            await addAppWide('Still fine.');

            const missing = await t.http.post('/api/stories/999999/saved-replies').send({ text: 'Hi' }).expect(404);
            expect(missing.body.error.code).toBe('404.003.001');
        });

        it("goes with the Story when it is deleted, leaving app-wide lines", async () => {
            const story = await createStory();
            await addToStory(story.id, 'Gone soon.');
            await addAppWide('Stays.');
            await t.http.delete(`/api/stories/${story.id}`).expect(204);

            const client = new pg.Client({ connectionString: t.databaseUrl });
            await client.connect();
            const { rows } = await client.query<{ text: string; story_id: number | null }>(
                'SELECT text, story_id FROM saved_reply WHERE story_id = $1 OR story_id IS NULL',
                [story.id],
            );
            await client.end();
            expect(rows).toEqual([{ text: 'Stays.', story_id: null }]);
        });

        it('is copied by Duplicate Story, in order, as lines of the copy alone', async () => {
            const story = await createStory();
            await addToStory(story.id, 'First.');
            const source = await addToStory(story.id, 'Second.');
            await addAppWide('App-wide.');

            const { body: copy } = await t.http.post(`/api/stories/${story.id}/duplicate`).expect(201);
            expect(texts(copy.savedReplies)).toEqual(['First.', 'Second.']);
            expect(copy.savedReplies.map((line: SavedReply) => line.id)).not.toContain(source.savedReplies[0].id);

            // Editing the copy's line leaves the source's alone.
            await t.http.patch(`/api/stories/${copy.id}/saved-replies/${copy.savedReplies[0].id}`).send({ text: 'Changed.' }).expect(200);
            expect(texts((await t.http.get(`/api/stories/${story.id}`).expect(200)).body.savedReplies)).toEqual(['First.', 'Second.']);
            expect(texts((await t.http.get('/api/saved-replies').expect(200)).body.savedReplies)).toEqual(['App-wide.']);
        });
    });

    it("the Chat detail lists the Story's lines, then the app-wide ones, each in add order and with its scope", async () => {
        const story = await createStory();
        const other = await createStory('Other');
        await addAppWide('App one.');
        await addToStory(story.id, 'Story one.');
        await addAppWide('App two.');
        await addToStory(story.id, 'Story two.');
        await addToStory(other.id, 'Not here.');

        const { body } = await t.http.post(`/api/stories/${story.id}/chats`).expect(201);
        const lines = (body as Chat).savedReplies;
        expect(lines.map(({ text, scope }) => ({ text, scope }))).toEqual([
            { text: 'Story one.', scope: 'story' },
            { text: 'Story two.', scope: 'story' },
            { text: 'App one.', scope: 'app' },
            { text: 'App two.', scope: 'app' },
        ]);
        const again = await t.http.get(`/api/stories/${story.id}/chats/${body.id}`).expect(200);
        expect(again.body.savedReplies).toEqual(lines);
    });
});

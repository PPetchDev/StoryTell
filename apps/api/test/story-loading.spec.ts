import { DataSource } from 'typeorm';

import { StoryModelService } from '../src/model/story/story.service.js';
import { EXPRESSION_EMOTIONS } from '../src/model/story/emotion.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// docs/ui-audit-2026-11-13.md, H1: a Story read in one query joined every one-to-many relation at
// once (Characters × Expressions × Scenes × Lore …), about 25,700 rows for one real Story, and Home
// waited 3.5–3.9 s. Each relation is now read by a query of its own.

/** The tables a Story has many rows of: two of them joined in one query multiply each other. */
const MANY = ['character', 'character_expression', 'starting_bond', 'starting_belief', 'scene', 'scene_bond_gate', 'lore_entry', 'story_document', 'saved_reply', 'replace_rule'];

/** How many of the `MANY` tables a query joins. */
function manyJoins(sql: string): number {
    return MANY.filter((table) => new RegExp(`JOIN "${table}"`, 'i').test(sql)).length;
}

describe('Story loading', () => {
    let t: TestApp;
    let storyId: number;
    let queries: string[];

    beforeAll(async () => {
        t = await startTestApp();
        const { body } = await t.http.post('/api/stories').send({ title: 'A Busy Tale' }).expect(201);
        storyId = body.id as number;
        const characterIds: number[] = [];
        for (const name of ['Nara', 'Dulcie', 'Tavri']) {
            const story = (await t.http.post(`/api/stories/${storyId}/characters`).send({ name }).expect(201)).body;
            characterIds.push(story.characters.at(-1).id as number);
        }
        await t.app.get(StoryModelService).insertExpressions(
            characterIds.flatMap((characterId) =>
                EXPRESSION_EMOTIONS.slice(0, 3).map((emotion) => ({ characterId, emotion, imagePath: `expressions/story-${storyId}/c${characterId}-${emotion}.png`, crop: null, drawnFrom: null })),
            ),
        );
        for (let i = 0; i < 4; i++) await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: `Scene ${i}`, situation: 'Somewhere.' }).expect(201);
        for (let i = 0; i < 3; i++) await t.http.post(`/api/stories/${storyId}/lore`).send({ name: `Lore ${i}`, text: 'A fact.', alwaysOn: true }).expect(201);

        const dataSource = t.app.get(DataSource);
        const logger = dataSource.logger;
        queries = [];
        (dataSource as { logger: unknown }).logger = new Proxy(logger, {
            get(target, key, receiver) {
                if (key === 'logQuery') return (query: string) => queries.push(query);
                return Reflect.get(target, key, receiver);
            },
        });
    });

    afterAll(async () => {
        await t.close();
    });

    it('lists and opens a Story without joining two of its many-row relations in one query', async () => {
        queries.length = 0;
        const list = await t.http.get('/api/stories').expect(200);
        const story = await t.http.get(`/api/stories/${storyId}`).expect(200);
        const worst = Math.max(...queries.map(manyJoins));
        expect({ worst, query: queries.find((query) => manyJoins(query) === worst)?.slice(0, 160) }).toMatchObject({ worst: expect.any(Number) });
        expect(worst).toBeLessThanOrEqual(1);

        // Everything still arrives, in order.
        expect(list.body.stories.find((entry: { id: number }) => entry.id === storyId)).toBeDefined();
        expect(story.body.characters.map((character: { name: string }) => character.name)).toEqual(['Nara', 'Dulcie', 'Tavri']);
        expect(story.body.characters.every((character: { expressions?: unknown[] }) => (character.expressions ?? []).length === 3)).toBe(true);
        expect(story.body.scenes.map((scene: { name: string }) => scene.name)).toEqual(['Scene 0', 'Scene 1', 'Scene 2', 'Scene 3']);
        expect(story.body.lore).toHaveLength(3);
    });
});

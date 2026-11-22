import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { parseJudgement } from '../src/manager/chat/judge/judge-prompt.js';
import { EXPRESSION_EMOTIONS, INTIMATE_EMOTIONS } from '../src/model/story/emotion.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/stage-pictures/spec.md: the six intimate emotions, and cut-outs for the Visual novel stage.

interface Expression {
    emotion: string;
    imagePath: string;
    cutoutPath: string | null;
}

interface Character {
    id: number;
    referenceImagePath: string | null;
    referenceCutoutPath: string | null;
    expressions: Expression[];
}

interface Story {
    id: number;
    characters: Character[];
}

const NARA = { name: 'Nara', appearance: 'Tall, dark hair, small horns.', personality: 'Warm.', voice: 'Low.' };

function png(label: string): Buffer {
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(label)]);
}

function jpeg(label: string): Buffer {
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(label)]);
}

async function filesUnder(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .sort();
}

describe('Stage pictures', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
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

    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Steppe' }).expect(201);
        const { body } = await t.http.post(`/api/stories/${created.body.id}/characters`).send(NARA).expect(201);
        return body as Story;
    }

    async function pickReferenceImage(story: Story, label: string): Promise<Story> {
        const characterId = story.characters[0].id;
        t.gateway.scriptImage('reference_image', ...[1, 2, 3].map(() => ({ image: { bytes: jpeg(label), mimeType: 'image/jpeg' } })));
        const round = await t.http.post(`/api/stories/${story.id}/characters/${characterId}/reference-image/candidates`).expect(201);
        const picked = await t.http.put(`/api/stories/${story.id}/characters/${characterId}/reference-image`).send({ candidateId: round.body.candidates[0].id }).expect(200);
        t.gateway.reset();
        return picked.body as Story;
    }

    const expressionPath = (story: Story, emotion: string) => `/api/stories/${story.id}/characters/${story.characters[0].id}/expressions/${emotion}`;

    it('draws every one of the emotions, the six intimate ones included', async () => {
        const story = await pickReferenceImage(await createStory(), 'nara');
        expect(EXPRESSION_EMOTIONS).toHaveLength(21);
        for (const emotion of INTIMATE_EMOTIONS) {
            t.gateway.scriptImage('expression_image', { image: { bytes: png(emotion), mimeType: 'image/png' } });
            await t.http.post(`${expressionPath(story, emotion)}/draw`).expect(201);
        }
        const nara = ((await t.http.get(`/api/stories/${story.id}`).expect(200)).body as Story).characters[0];
        expect(nara.expressions.map((expression) => expression.emotion)).toEqual([...INTIMATE_EMOTIONS]);
        expect(nara.expressions.every((expression) => expression.cutoutPath !== null)).toBe(true);
        // The Reference image was cut out once, with the first drawing.
        expect(t.gateway.imageCalls().filter((call) => call.kind === 'image_cutout')).toHaveLength(INTIMATE_EMOTIONS.length + 1);
    });

    it('keeps a drawing whose cut-out fails, with no cut-out, and Cut out makes one later', async () => {
        const story = await pickReferenceImage(await createStory(), 'nara');
        t.gateway.scriptImage('expression_image', { image: { bytes: png('desire'), mimeType: 'image/png' } });
        t.gateway.scriptImage('image_cutout', new ProviderOutageError('Venice is down.'), new ProviderOutageError('Venice is down.'));

        const drawn = ((await t.http.post(`${expressionPath(story, 'desire')}/draw`).expect(201)).body as Story).characters[0];
        expect(drawn.expressions).toEqual([expect.objectContaining({ emotion: 'desire', cutoutPath: null })]);
        expect(drawn.referenceCutoutPath).toBeNull();
        expect(await filesUnder(t.imageDir)).toEqual([drawn.expressions[0].imagePath, drawn.referenceImagePath!].sort());

        t.gateway.scriptImage('image_cutout', { image: { bytes: png('desire-cut'), mimeType: 'image/png' } }, { image: { bytes: png('nara-cut'), mimeType: 'image/png' } });
        const cut = ((await t.http.post(`${expressionPath(story, 'desire')}/cutout`).expect(201)).body as Story).characters[0];
        expect(cut.expressions[0].cutoutPath).toMatch(/-desire-[0-9a-f]+-cutout\.png$/);
        expect(await readFile(path.join(t.imageDir, cut.expressions[0].cutoutPath!))).toEqual(png('desire-cut'));
        expect(await readFile(path.join(t.imageDir, cut.referenceCutoutPath!))).toEqual(png('nara-cut'));
    });

    it('Cut out on an upload cuts it out; without the Expression it is a 404 and makes no call', async () => {
        const story = await createStory();
        await t.http.put(expressionPath(story, 'teasing')).attach('image', png('mine'), 'mine.png').expect(200);
        expect(t.gateway.imageCalls()).toEqual([]);

        const cut = ((await t.http.post(`${expressionPath(story, 'teasing')}/cutout`).expect(201)).body as Story).characters[0];
        expect(cut.expressions[0].cutoutPath).not.toBeNull();
        // No Reference image: nothing more to cut.
        expect(cut.referenceCutoutPath).toBeNull();
        expect(t.gateway.imageCalls()).toHaveLength(1);

        await t.http.post(`${expressionPath(story, 'passion')}/cutout`).expect(404);
        expect(t.gateway.imageCalls()).toHaveLength(1);
    });

    // .scratch/own-cutout/spec.md, "A choice of two"
    it('Cut out asks the maker named with ?with=, over a cut-out already there, and refuses an unknown maker', async () => {
        const story = await createStory();
        await t.http.put(expressionPath(story, 'teasing')).attach('image', png('mine'), 'mine.png').expect(200);
        const makers = () => t.gateway.imageCalls().filter((call) => call.kind === 'image_cutout').map((call) => call.cutoutBy ?? null);

        const first = ((await t.http.post(`${expressionPath(story, 'teasing')}/cutout?with=own`).expect(201)).body as Story).characters[0].expressions[0].cutoutPath;
        const second = ((await t.http.post(`${expressionPath(story, 'teasing')}/cutout?with=venice`).expect(201)).body as Story).characters[0].expressions[0].cutoutPath;
        await t.http.post(`${expressionPath(story, 'teasing')}/cutout`).expect(201);

        // Named, named, and left to the gateway.
        expect(makers()).toEqual(['own', 'venice', null]);
        expect(second).not.toBeNull();
        expect(second).not.toBe(first);
        await t.http.post(`${expressionPath(story, 'teasing')}/cutout?with=canva`).expect(400);
        expect(makers()).toHaveLength(3);
    });

    it('a failed Cut out answers the error and keeps the Expression as it was', async () => {
        const story = await createStory();
        await t.http.put(expressionPath(story, 'longing')).attach('image', png('mine'), 'mine.png').expect(200);
        t.gateway.scriptImage('image_cutout', new ProviderOutageError('Venice is down.'));

        await t.http.post(`${expressionPath(story, 'longing')}/cutout`).expect(502);
        const nara = ((await t.http.get(`/api/stories/${story.id}`).expect(200)).body as Story).characters[0];
        expect(nara.expressions).toEqual([expect.objectContaining({ emotion: 'longing', cutoutPath: null })]);
        expect(await filesUnder(t.imageDir)).toEqual([nara.expressions[0].imagePath]);
    });

    it('removing an Expression, or the Reference image, deletes its cut-out; a new Reference image has none until cut', async () => {
        const story = await pickReferenceImage(await createStory(), 'nara');
        t.gateway.scriptImage('expression_image', { image: { bytes: png('afterglow'), mimeType: 'image/png' } });
        const drawn = ((await t.http.post(`${expressionPath(story, 'afterglow')}/draw`).expect(201)).body as Story).characters[0];
        expect(await filesUnder(t.imageDir)).toHaveLength(4);

        await t.http.delete(expressionPath(story, 'afterglow')).expect(200);
        expect(await filesUnder(t.imageDir)).toEqual([drawn.referenceImagePath!, drawn.referenceCutoutPath!].sort());

        const replaced = (await pickReferenceImage(story, 'nara-two')).characters[0];
        expect(replaced.referenceCutoutPath).toBeNull();
        expect(await filesUnder(t.imageDir)).toEqual([replaced.referenceImagePath!]);
    });

    it('Duplicate copies the cut-outs to files of the copy\'s own', async () => {
        const story = await pickReferenceImage(await createStory(), 'nara');
        t.gateway.scriptImage('expression_image', { image: { bytes: png('joy'), mimeType: 'image/png' } });
        await t.http.post(`${expressionPath(story, 'joy')}/draw`).expect(201);

        const copy = (await t.http.post(`/api/stories/${story.id}/duplicate`).expect(201)).body as Story;
        const nara = copy.characters[0];
        expect(nara.referenceCutoutPath).toMatch(new RegExp(`^reference-images/story-${copy.id}/character-${nara.id}-cutout-[0-9a-f]+\\.png$`));
        expect(nara.expressions[0].cutoutPath).toMatch(new RegExp(`^expressions/story-${copy.id}/character-${nara.id}-joy-[0-9a-f]+-cutout\\.png$`));
        expect(await filesUnder(t.imageDir)).toHaveLength(8);
    });

    it('the Judge may tag a line with an intimate emotion', () => {
        const base = '{"bond_changes":[],"arc_steps":[],"scene":null';
        for (const emotion of INTIMATE_EMOTIONS) {
            expect(parseJudgement(`${base},"expressions":[{"line":1,"emotion":"${emotion}"}]}`).expressions).toEqual([{ line: 1, emotion }]);
        }
    });
});

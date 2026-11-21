import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { EXPRESSION_EMOTIONS } from '../src/model/story/emotion.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface Expression {
    emotion: string;
    imagePath: string;
    outdated: boolean;
}

interface Character {
    id: number;
    expressions: Expression[];
}

interface Story {
    id: number;
    characters: Character[];
}

interface Drawing {
    running: boolean;
    emotions: string[];
    drawn: string[];
    current: string | null;
    failed: { code: string; message: string } | null;
}

const ALL: string[] = [...EXPRESSION_EMOTIONS];

const MIRA = { name: 'Mira', appearance: 'Tall, grey-green eyes, black hair tied back.', personality: 'Guarded.', voice: 'Short.' };

function png(label: string): Buffer {
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(label)]);
}

function jpeg(label: string): Buffer {
    return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(label)]);
}

const drawnPicture = (label: string, delayMs?: number) => ({ image: { bytes: png(label), mimeType: 'image/png' }, ...(delayMs ? { delayMs } : {}) });

// .scratch/expression-drawing/spec.md
describe('Draw all on the server', () => {
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

    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const { body } = await t.http.post(`/api/stories/${created.body.id}/characters`).send(MIRA).expect(201);
        return body as Story;
    }

    async function pickReferenceImage(story: Story, label: string): Promise<void> {
        const base = `/api/stories/${story.id}/characters/${story.characters[0].id}/reference-image`;
        t.gateway.scriptImage('reference_image', ...[1, 2, 3].map(() => ({ image: { bytes: jpeg(label), mimeType: 'image/jpeg' } })));
        const round = await t.http.post(`${base}/candidates`).expect(201);
        await t.http.put(base).send({ candidateId: round.body.candidates[0].id }).expect(200);
        t.gateway.reset();
    }

    const drawingPath = (story: Story) => `/api/stories/${story.id}/characters/${story.characters[0].id}/expression-drawing`;
    const expressionPath = (story: Story, emotion: string) => `/api/stories/${story.id}/characters/${story.characters[0].id}/expressions/${emotion}`;

    async function getStory(storyId: number): Promise<Story> {
        return (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
    }

    /** Asks how the run is going until it has stopped. */
    async function finished(story: Story): Promise<Drawing> {
        for (let tries = 0; tries < 200; tries++) {
            const { body } = await t.http.get(drawingPath(story)).expect(200);
            if (!(body as Drawing).running) return body as Drawing;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        throw new Error('the run never stopped');
    }

    it('draws every emotion with no Expression, in order, and keeps an upload and a current drawing', async () => {
        const story = await createStory();
        await pickReferenceImage(story, 'mira');
        await t.http.put(expressionPath(story, 'joy')).attach('image', png('uploaded-joy'), 'joy.png').expect(200);
        t.gateway.scriptImage('expression_image', drawnPicture('love'));
        const love = (await t.http.post(`${expressionPath(story, 'love')}/draw`).expect(201)).body as Story;
        t.gateway.reset();
        t.gateway.scriptImage('expression_image', ...ALL.slice(2).map((emotion) => drawnPicture(emotion)));

        const { body: started } = await t.http.post(drawingPath(story)).send({}).expect(201);

        expect((started as Drawing).emotions).toEqual(ALL.slice(2));
        const done = await finished(story);
        expect(done).toEqual({ running: false, emotions: ALL.slice(2), drawn: ALL.slice(2), current: null, failed: null });
        expect(t.gateway.imageCalls('expression_image')).toHaveLength(ALL.length - 2);
        const expressions = (await getStory(story.id)).characters[0].expressions;
        expect(expressions.map((one) => one.emotion)).toEqual(ALL);
        expect(expressions[1].imagePath).toBe(love.characters[0].expressions.find((one) => one.emotion === 'love')!.imagePath);
    });

    it('draws an outdated Expression again: one drawn from another Reference image', async () => {
        const story = await createStory();
        await pickReferenceImage(story, 'first');
        t.gateway.scriptImage('expression_image', ...ALL.map((emotion) => drawnPicture(emotion)));
        await t.http.post(drawingPath(story)).send({}).expect(201);
        await finished(story);
        await pickReferenceImage(story, 'second');
        t.gateway.scriptImage('expression_image', ...ALL.map((emotion) => drawnPicture(`${emotion}-again`)));

        const { body } = await t.http.post(drawingPath(story)).send({}).expect(201);

        expect((body as Drawing).emotions).toEqual(ALL);
        await finished(story);
        expect((await getStory(story.id)).characters[0].expressions.every((one) => !one.outdated)).toBe(true);
    });

    it('with every one there and current, draws nothing unless asked to redraw, then draws them all', async () => {
        const story = await createStory();
        await pickReferenceImage(story, 'mira');
        t.gateway.scriptImage('expression_image', ...ALL.map((emotion) => drawnPicture(emotion)));
        await t.http.post(drawingPath(story)).send({}).expect(201);
        await finished(story);
        t.gateway.reset();

        const { body: idle } = await t.http.post(drawingPath(story)).send({}).expect(201);
        expect(idle).toEqual({ running: false, emotions: [], drawn: [], current: null, failed: null });
        expect(t.gateway.imageCalls()).toEqual([]);

        t.gateway.scriptImage('expression_image', ...ALL.map((emotion) => drawnPicture(`${emotion}-redrawn`)));
        const { body: redraw } = await t.http.post(drawingPath(story)).send({ redraw: true }).expect(201);
        expect((redraw as Drawing).emotions).toEqual(ALL);
        expect((await finished(story)).drawn).toEqual(ALL);
        expect(t.gateway.imageCalls('expression_image')).toHaveLength(ALL.length);
    });

    it('answers before the drawings finish, and goes on with no one asking', async () => {
        const story = await createStory();
        await pickReferenceImage(story, 'mira');
        t.gateway.scriptImage('expression_image', ...ALL.map((emotion) => drawnPicture(emotion, 30)));

        const { body } = await t.http.post(drawingPath(story)).send({}).expect(201);

        expect(body).toMatchObject({ running: true, emotions: ALL, drawn: [] });
        // Nobody asks about the run: only the saved Story is read until all of them are there.
        let saved = 0;
        for (let tries = 0; tries < 300 && saved < ALL.length; tries++) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            saved = (await getStory(story.id)).characters[0].expressions.length;
        }
        expect(saved).toBe(ALL.length);
        expect(await finished(story)).toMatchObject({ running: false, drawn: ALL, failed: null });
    });

    it('runs once at a time: starting again while it runs answers the same run and draws nothing twice', async () => {
        const story = await createStory();
        await pickReferenceImage(story, 'mira');
        t.gateway.scriptImage('expression_image', ...ALL.map((emotion) => drawnPicture(emotion, 20)));

        await t.http.post(drawingPath(story)).send({}).expect(201);
        const { body: again } = await t.http.post(drawingPath(story)).send({ redraw: true }).expect(201);

        expect(again).toMatchObject({ running: true, emotions: ALL });
        await finished(story);
        expect(t.gateway.imageCalls('expression_image')).toHaveLength(ALL.length);
    });

    it('stops at the first failure, keeps what was drawn, and says why', async () => {
        const story = await createStory();
        await pickReferenceImage(story, 'mira');
        t.gateway.scriptImage('expression_image', drawnPicture('joy'), drawnPicture('love'), new ProviderOutageError('Venice: down'));

        await t.http.post(drawingPath(story)).send({}).expect(201);
        const done = await finished(story);

        expect(done).toEqual({ running: false, emotions: ALL, drawn: ['joy', 'love'], current: null, failed: { code: '502.001.001', message: 'Venice: down' } });
        expect(t.gateway.imageCalls('expression_image')).toHaveLength(3);
        expect((await getStory(story.id)).characters[0].expressions.map((one) => one.emotion)).toEqual(['joy', 'love']);

        // Draw all again picks up where it stopped.
        t.gateway.reset();
        t.gateway.scriptImage('expression_image', ...ALL.slice(2).map((emotion) => drawnPicture(emotion)));
        const { body } = await t.http.post(drawingPath(story)).send({}).expect(201);
        expect((body as Drawing).emotions).toEqual(ALL.slice(2));
        expect((await finished(story)).failed).toBeNull();
    });

    it('stops when the image credit runs out partway', async () => {
        const story = await createStory();
        await pickReferenceImage(story, 'mira');
        t.gateway.scriptImage('expression_image', drawnPicture('joy'), drawnPicture('love'));
        let calls = 0;
        const realGenerate = t.gateway.generateImage.bind(t.gateway);
        t.gateway.generateImage = async (request) => {
            const result = await realGenerate(request);
            if (request.kind === 'expression_image' && ++calls === 2) t.gateway.setRemainingCredit({ image: { remainingUsd: 0, limitUsd: 8 } });
            return result;
        };
        try {
            await t.http.post(drawingPath(story)).send({}).expect(201);
            const done = await finished(story);

            expect(done.drawn).toEqual(['joy', 'love']);
            expect(done.failed?.code).toBe('402.001.004');
        } finally {
            t.gateway.generateImage = realGenerate;
        }
    });

    it('is refused before any call without a Reference image, or out of image credit', async () => {
        const story = await createStory();
        const { body: noReference } = await t.http.post(drawingPath(story)).send({}).expect(409);
        expect(noReference.error.code).toBe('409.003.023');

        await pickReferenceImage(story, 'mira');
        t.gateway.setRemainingCredit({ image: { remainingUsd: 0, limitUsd: 8 } });
        const { body: noCredit } = await t.http.post(drawingPath(story)).send({}).expect(402);
        expect(noCredit.error.code).toBe('402.001.004');
        expect(t.gateway.imageCalls()).toEqual([]);
    });

    it('answers idle before any run, and 404 for a Character of another Story', async () => {
        const story = await createStory();
        const other = await createStory();

        const { body } = await t.http.get(drawingPath(story)).expect(200);
        expect(body).toEqual({ running: false, emotions: [], drawn: [], current: null, failed: null });

        const wrong = `/api/stories/${other.id}/characters/${story.characters[0].id}/expression-drawing`;
        await t.http.get(wrong).expect(404);
        await t.http.post(wrong).send({}).expect(404);
    });
});

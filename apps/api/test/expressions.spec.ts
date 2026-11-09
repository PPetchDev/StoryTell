import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { EXPRESSION_LOOKS } from '../src/manager/expression/prompt.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { recordedFetch } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface Expression {
    emotion: string;
    imagePath: string;
    crop: { x: number; y: number; size: number } | null;
    outdated: boolean;
}

interface Character {
    id: number;
    name: string;
    referenceImagePath: string | null;
    portraitCrop: { x: number; y: number; size: number } | null;
    expressions: Expression[];
}

interface Story {
    id: number;
    characters: Character[];
}

const MIRA = { name: 'Mira', appearance: 'Tall, grey-green eyes, black hair tied back.', personality: 'Guarded.', voice: 'Short.' };
const KAI = { name: 'Kai', appearance: 'Wiry, red curls.', personality: 'Nosy.', voice: 'Rambling.' };

/** A real PNG signature followed by filler: the store reads the type from the first bytes. */
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

const EXPRESSION_PATH = /^expressions\/story-\d+\/character-\d+-joy-[0-9a-f]+\.png$/;

// .scratch/expressions/issues/01-expressions-on-a-character.md
describe('Expressions on a Character', () => {
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

    /** A Story with Mira and Kai; neither has a Reference image. */
    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.post(`/api/stories/${storyId}/characters`).send(MIRA).expect(201);
        const { body } = await t.http.post(`/api/stories/${storyId}/characters`).send(KAI).expect(201);
        return body as Story;
    }

    async function pickReferenceImage(storyId: number, characterId: number, label: string): Promise<Story> {
        t.gateway.scriptImage('reference_image', ...[1, 2, 3, 4].map(() => ({ image: { bytes: jpeg(label), mimeType: 'image/jpeg' } })));
        const round = await t.http.post(`/api/stories/${storyId}/characters/${characterId}/reference-image/candidates`).expect(201);
        const picked = await t.http
            .put(`/api/stories/${storyId}/characters/${characterId}/reference-image`)
            .send({ candidateId: round.body.candidates[0].id })
            .expect(200);
        t.gateway.reset();
        return picked.body as Story;
    }

    function expressionPath(story: Story, emotion: string, characterIndex = 0): string {
        return `/api/stories/${story.id}/characters/${story.characters[characterIndex].id}/expressions/${emotion}`;
    }

    function upload(story: Story, emotion: string, bytes: Buffer, characterIndex = 0) {
        return t.http.put(expressionPath(story, emotion, characterIndex)).attach('image', bytes, 'face.png');
    }

    async function getStory(storyId: number): Promise<Story> {
        return (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
    }

    it('starts with none: a Story without Expressions answers an empty list per Character', async () => {
        const story = await createStory();
        expect(story.characters.map((character) => character.expressions)).toEqual([[], []]);
    });

    describe('upload', () => {
        it('stores the picture as a file of its own and answers it on the Character, with the Portrait square', async () => {
            const story = await createStory();

            const { body } = await upload(story, 'joy', png('mira-happy')).expect(200);

            const mira = (body as Story).characters[0];
            expect(mira.expressions).toEqual([{ emotion: 'joy', imagePath: expect.stringMatching(EXPRESSION_PATH), crop: null, outdated: false }]);
            expect(mira.expressions[0].imagePath).toContain(`story-${story.id}/character-${mira.id}-joy-`);
            expect((body as Story).characters[1].expressions).toEqual([]);
            expect(await filesUnder(t.imageDir)).toEqual([mira.expressions[0].imagePath]);
            expect(await readFile(path.join(t.imageDir, mira.expressions[0].imagePath))).toEqual(png('mira-happy'));
            const served = await t.http.get(`/api/images/${mira.expressions[0].imagePath}`).expect(200);
            expect(served.headers['content-type']).toBe('image/png');
            // It reads back with the Story.
            expect((await getStory(story.id)).characters[0].expressions).toEqual(mira.expressions);
        });

        it('lists Expressions in the fixed order of the emotions, not the order they were added', async () => {
            const story = await createStory();
            await upload(story, 'surprise', png('s')).expect(200);
            await upload(story, 'love', jpeg('l')).expect(200);
            const { body } = await upload(story, 'joy', png('j')).expect(200);

            expect((body as Story).characters[0].expressions.map((expression) => expression.emotion)).toEqual(['joy', 'love', 'surprise']);
            expect((body as Story).characters[0].expressions[1].imagePath).toMatch(/\.jpg$/);
        });

        it('a second upload replaces the file, and its own square goes back to the Portrait\'s', async () => {
            const story = await createStory();
            const first = (await upload(story, 'joy', png('one')).expect(200)).body as Story;
            await t.http.put(`${expressionPath(story, 'joy')}/crop`).send({ x: 0.2, y: 0.1, size: 0.5 }).expect(200);

            const second = (await upload(story, 'joy', png('two')).expect(200)).body as Story;

            const before = first.characters[0].expressions[0].imagePath;
            const after = second.characters[0].expressions[0];
            expect(after.imagePath).not.toBe(before);
            expect(after.crop).toBeNull();
            expect(await filesUnder(t.imageDir)).toEqual([after.imagePath]);
            expect(await readFile(path.join(t.imageDir, after.imagePath))).toEqual(png('two'));
        });

        it('refuses a file that is not a PNG, JPEG or WebP, with the Cover upload\'s code, and writes nothing', async () => {
            const story = await createStory();
            const { body } = await upload(story, 'joy', Buffer.from('GIF89a not allowed')).expect(415);
            expect(body.error.code).toBe('415.002.009');
            expect(await filesUnder(t.imageDir)).toEqual([]);
            expect((await getStory(story.id)).characters[0].expressions).toEqual([]);
        });

        it('refuses a request without a file, and a file over 15 MB', async () => {
            const story = await createStory();
            const empty = await t.http.put(expressionPath(story, 'joy')).field('note', 'no file').expect(400);
            expect(empty.body.error.code).toBe('400.002.008');

            const huge = Buffer.concat([png('big'), Buffer.alloc(15 * 1024 * 1024)]);
            const tooLarge = await upload(story, 'joy', huge).expect(413);
            expect(tooLarge.body.error.code).toBe('413.002.010');
            expect(await filesUnder(t.imageDir)).toEqual([]);
        });

        it("answers 404 for a Character of another Story, or a Story that isn't there", async () => {
            const story = await createStory();
            const other = await createStory();
            const theirs = await t.http
                .put(`/api/stories/${story.id}/characters/${other.characters[0].id}/expressions/joy`)
                .attach('image', png('x'), 'face.png')
                .expect(404);
            expect(theirs.body.error.code).toBe('404.003.002');
            const gone = await t.http.put('/api/stories/999999/characters/1/expressions/joy').attach('image', png('x'), 'face.png').expect(404);
            expect(gone.body.error.code).toBe('404.003.001');
            expect(await filesUnder(t.imageDir)).toEqual([]);
        });
    });

    it('answers 400 for an emotion outside the seven, neutral included, on every route', async () => {
        const story = await createStory();
        for (const emotion of ['neutral', 'bored', 'JOY']) {
            const uploaded = await upload(story, emotion, png('x')).expect(400);
            expect(uploaded.body.error.code).toMatch(/^400\./);
            await t.http.put(`${expressionPath(story, emotion)}/crop`).send({ x: 0, y: 0, size: 0.5 }).expect(400);
            await t.http.delete(`${expressionPath(story, emotion)}/crop`).expect(400);
            await t.http.delete(expressionPath(story, emotion)).expect(400);
        }
        expect(await filesUnder(t.imageDir)).toEqual([]);
    });

    describe('its square', () => {
        it('is set and reset, and the file stays', async () => {
            const story = await createStory();
            await upload(story, 'sadness', png('sad')).expect(200);

            const set = (await t.http.put(`${expressionPath(story, 'sadness')}/crop`).send({ x: 0.25, y: 0.5, size: 0.5 }).expect(200)).body as Story;
            expect(set.characters[0].expressions[0].crop).toEqual({ x: 0.25, y: 0.5, size: 0.5 });
            expect((await getStory(story.id)).characters[0].expressions[0].crop).toEqual({ x: 0.25, y: 0.5, size: 0.5 });

            const reset = (await t.http.delete(`${expressionPath(story, 'sadness')}/crop`).expect(200)).body as Story;
            expect(reset.characters[0].expressions[0].crop).toBeNull();
            expect(await filesUnder(t.imageDir)).toEqual([reset.characters[0].expressions[0].imagePath]);
        });

        it('must lie inside the picture', async () => {
            const story = await createStory();
            await upload(story, 'sadness', png('sad')).expect(200);
            await t.http.put(`${expressionPath(story, 'sadness')}/crop`).send({ x: 0.8, y: 0, size: 0.5 }).expect(400);
            await t.http.put(`${expressionPath(story, 'sadness')}/crop`).send({ x: 0, y: 0 }).expect(400);
        });

        it('answers 404 for an emotion with no Expression', async () => {
            const story = await createStory();
            const set = await t.http.put(`${expressionPath(story, 'anger')}/crop`).send({ x: 0, y: 0, size: 0.5 }).expect(404);
            expect(set.body.error.code).toBe('404.003.022');
            const reset = await t.http.delete(`${expressionPath(story, 'anger')}/crop`).expect(404);
            expect(reset.body.error.code).toBe('404.003.022');
        });
    });

    describe('remove', () => {
        it('deletes the row and its file; the emotion falls back to the Portrait', async () => {
            const story = await createStory();
            await upload(story, 'fear', png('fear')).expect(200);
            await upload(story, 'joy', png('joy')).expect(200);

            const { body } = await t.http.delete(expressionPath(story, 'fear')).expect(200);

            const left = (body as Story).characters[0].expressions;
            expect(left.map((expression) => expression.emotion)).toEqual(['joy']);
            expect(await filesUnder(t.imageDir)).toEqual([left[0].imagePath]);
        });

        it('answers 404 for an emotion with no Expression', async () => {
            const story = await createStory();
            const { body } = await t.http.delete(expressionPath(story, 'fear')).expect(404);
            expect(body.error.code).toBe('404.003.022');
            expect(body.error.message).toBe('That Character has no Expression for that emotion.');
        });
    });

    describe('the Reference image', () => {
        it('replacing or removing it keeps every Expression, and an uploaded one is never outdated', async () => {
            const story = await createStory();
            await pickReferenceImage(story.id, story.characters[0].id, 'mira-1');
            await upload(story, 'joy', png('joy')).expect(200);

            const replaced = await pickReferenceImage(story.id, story.characters[0].id, 'mira-2');
            expect(replaced.characters[0].expressions).toEqual([expect.objectContaining({ emotion: 'joy', outdated: false })]);

            const removed = (await t.http.delete(`/api/stories/${story.id}/characters/${story.characters[0].id}/reference-image`).expect(200)).body as Story;
            expect(removed.characters[0].expressions).toEqual([expect.objectContaining({ emotion: 'joy', outdated: false })]);
            expect(await filesUnder(t.imageDir)).toEqual([removed.characters[0].expressions[0].imagePath]);
        });
    });

    describe('deletes the files', () => {
        it('when the Character is removed', async () => {
            const story = await createStory();
            await upload(story, 'joy', png('mira')).expect(200);
            const kaiJoy = ((await upload(story, 'joy', png('kai'), 1).expect(200)).body as Story).characters[1].expressions[0].imagePath;

            await t.http.delete(`/api/stories/${story.id}/characters/${story.characters[0].id}`).expect(200);

            expect(await filesUnder(t.imageDir)).toEqual([kaiJoy]);
        });

        it('when the Story is deleted, next to the Reference image files', async () => {
            const story = await createStory();
            await pickReferenceImage(story.id, story.characters[0].id, 'mira');
            await upload(story, 'joy', png('mira')).expect(200);
            await upload(story, 'love', png('kai'), 1).expect(200);
            expect(await filesUnder(t.imageDir)).toHaveLength(3);

            await t.http.delete(`/api/stories/${story.id}`).expect(204);

            expect(await filesUnder(t.imageDir)).toEqual([]);
        });
    });

    // .scratch/expressions/issues/02-draw-an-expression.md
    describe('drawing', () => {
        function draw(story: Story, emotion: string, characterIndex = 0) {
            return t.http.post(`${expressionPath(story, emotion, characterIndex)}/draw`);
        }

        it('sends one expression_image call with the Reference image and a prompt for the emotion, and stores the result', async () => {
            const story = await createStory();
            const withImage = await pickReferenceImage(story.id, story.characters[0].id, 'mira-reference');
            const referencePath = withImage.characters[0].referenceImagePath!;
            t.gateway.scriptImage('expression_image', { image: { bytes: png('mira-happy'), mimeType: 'image/png' } });

            const { body } = await draw(story, 'joy').expect(201);

            const calls = t.gateway.imageCalls();
            expect(calls).toHaveLength(1);
            expect(calls[0].kind).toBe('expression_image');
            expect(calls[0].referenceImages).toEqual([{ bytes: jpeg('mira-reference'), mimeType: 'image/jpeg' }]);
            expect(calls[0].prompt).toContain(EXPRESSION_LOOKS.joy);
            expect(calls[0].prompt).toContain('Mira');
            expect(calls[0].prompt).toContain(MIRA.appearance);
            expect(calls[0].servedFor).toEqual({ storyId: story.id });
            expect(t.gateway.calls.filter((call) => call.method !== 'generateImage' && call.method !== 'remainingCredit')).toEqual([]);

            const mira = (body as Story).characters[0];
            expect(mira.expressions).toEqual([{ emotion: 'joy', imagePath: expect.stringMatching(EXPRESSION_PATH), crop: null, outdated: false }]);
            expect(await readFile(path.join(t.imageDir, mira.expressions[0].imagePath))).toEqual(png('mira-happy'));
            expect(await filesUnder(t.imageDir)).toEqual([mira.expressions[0].imagePath, referencePath].sort());
        });

        it('drawing again replaces the file and keeps the square', async () => {
            const story = await createStory();
            await pickReferenceImage(story.id, story.characters[0].id, 'mira');
            t.gateway.scriptImage(
                'expression_image',
                { image: { bytes: png('one'), mimeType: 'image/png' } },
                { image: { bytes: jpeg('two'), mimeType: 'image/jpeg' } },
            );
            const first = ((await draw(story, 'love').expect(201)).body as Story).characters[0].expressions[0];
            await t.http.put(`${expressionPath(story, 'love')}/crop`).send({ x: 0.3, y: 0.1, size: 0.4 }).expect(200);

            const second = ((await draw(story, 'love').expect(201)).body as Story).characters[0].expressions[0];

            expect(second.imagePath).not.toBe(first.imagePath);
            expect(second.imagePath).toMatch(/-love-[0-9a-f]+\.jpg$/);
            expect(second.crop).toEqual({ x: 0.3, y: 0.1, size: 0.4 });
            const files = await filesUnder(t.imageDir);
            expect(files).toContain(second.imagePath);
            expect(files).not.toContain(first.imagePath);
            expect(files).toHaveLength(2);
        });

        it('a drawing over an upload keeps its square too, and the upload is replaced', async () => {
            const story = await createStory();
            await pickReferenceImage(story.id, story.characters[0].id, 'mira');
            await upload(story, 'fear', png('uploaded')).expect(200);
            await t.http.put(`${expressionPath(story, 'fear')}/crop`).send({ x: 0, y: 0, size: 0.5 }).expect(200);
            t.gateway.scriptImage('expression_image', {});

            const drawn = ((await draw(story, 'fear').expect(201)).body as Story).characters[0].expressions[0];

            expect(drawn.crop).toEqual({ x: 0, y: 0, size: 0.5 });
            expect(await filesUnder(t.imageDir)).toHaveLength(2);
        });

        it('needs a Reference image, and makes no call without one', async () => {
            const story = await createStory();

            const { body } = await draw(story, 'joy').expect(409);

            expect(body.error).toEqual({ code: '409.003.023', message: 'Add a Reference image first: Expressions are drawn from it.' });
            expect(t.gateway.imageCalls()).toEqual([]);
            expect(await filesUnder(t.imageDir)).toEqual([]);
        });

        it('out of image credit (known from the provider) is refused before any call', async () => {
            const story = await createStory();
            await pickReferenceImage(story.id, story.characters[0].id, 'mira');
            t.gateway.setRemainingCredit({ image: { remainingUsd: 0, limitUsd: 8 } });

            const { body } = await draw(story, 'joy').expect(402);

            expect(body.error.code).toBe('402.001.004');
            expect(t.gateway.imageCalls()).toEqual([]);
            expect((await getStory(story.id)).characters[0].expressions).toEqual([]);
        });

        it('a gateway failure leaves the old Expression as it was', async () => {
            const story = await createStory();
            await pickReferenceImage(story.id, story.characters[0].id, 'mira');
            t.gateway.scriptImage('expression_image', { image: { bytes: png('kept'), mimeType: 'image/png' } }, new ProviderOutageError('Venice: down'));
            const before = (await draw(story, 'anger').expect(201)).body as Story;
            const filesBefore = await filesUnder(t.imageDir);

            const { body } = await draw(story, 'anger').expect(502);

            expect(body.error).toEqual({ code: '502.001.001', message: 'Venice: down' });
            expect((await getStory(story.id)).characters[0].expressions).toEqual(before.characters[0].expressions);
            expect(await filesUnder(t.imageDir)).toEqual(filesBefore);
        });

        it('answers 400 for an emotion outside the seven, and 404 for a Character that is not there', async () => {
            const story = await createStory();
            await draw(story, 'neutral').expect(400);
            const missing = await t.http.post(`/api/stories/${story.id}/characters/999999/expressions/joy/draw`).expect(404);
            expect(missing.body.error.code).toBe('404.003.002');
            expect(t.gateway.imageCalls()).toEqual([]);
        });

        it('replacing or removing the Reference image marks a drawn one outdated, and not an uploaded one', async () => {
            const story = await createStory();
            await pickReferenceImage(story.id, story.characters[0].id, 'mira-1');
            t.gateway.scriptImage('expression_image', {});
            await draw(story, 'joy').expect(201);
            const both = (await upload(story, 'sadness', png('sad')).expect(200)).body as Story;
            expect(both.characters[0].expressions.map((expression) => [expression.emotion, expression.outdated])).toEqual([
                ['joy', false],
                ['sadness', false],
            ]);

            const replaced = await pickReferenceImage(story.id, story.characters[0].id, 'mira-2');
            expect(replaced.characters[0].expressions.map((expression) => [expression.emotion, expression.outdated])).toEqual([
                ['joy', true],
                ['sadness', false],
            ]);
            // Kept, file and all.
            expect(replaced.characters[0].expressions[0].imagePath).toBe(both.characters[0].expressions[0].imagePath);

            const removed = (await t.http.delete(`/api/stories/${story.id}/characters/${story.characters[0].id}/reference-image`).expect(200)).body as Story;
            expect(removed.characters[0].expressions.map((expression) => expression.outdated)).toEqual([true, false]);

            // Drawing again from the new one makes it current.
            await pickReferenceImage(story.id, story.characters[0].id, 'mira-3');
            t.gateway.scriptImage('expression_image', {});
            const redrawn = (await draw(story, 'joy').expect(201)).body as Story;
            expect(redrawn.characters[0].expressions[0].outdated).toBe(false);
        });

        it('Duplicate keeps a current drawn Expression current, and an outdated one outdated', async () => {
            const story = await createStory();
            await pickReferenceImage(story.id, story.characters[0].id, 'mira-1');
            t.gateway.scriptImage('expression_image', {});
            await draw(story, 'joy').expect(201);
            await pickReferenceImage(story.id, story.characters[0].id, 'mira-2');
            t.gateway.scriptImage('expression_image', {});
            await draw(story, 'love').expect(201);

            const { body } = await t.http.post(`/api/stories/${story.id}/duplicate`).expect(201);

            expect((body as Story).characters[0].expressions.map((expression) => [expression.emotion, expression.outdated])).toEqual([
                ['joy', true],
                ['love', false],
            ]);
        });
    });

    describe('Duplicate Story', () => {
        it('copies each Expression to a file of its own, keeping its emotion and square', async () => {
            const story = await createStory();
            await upload(story, 'joy', png('mira-joy')).expect(200);
            await upload(story, 'anger', jpeg('mira-anger')).expect(200);
            await t.http.put(`${expressionPath(story, 'anger')}/crop`).send({ x: 0.1, y: 0.2, size: 0.3 }).expect(200);
            await upload(story, 'love', png('kai-love'), 1).expect(200);
            const source = await getStory(story.id);

            const { body } = await t.http.post(`/api/stories/${story.id}/duplicate`).expect(201);
            const copy = body as Story;

            for (const [index, character] of copy.characters.entries()) {
                const original = source.characters[index].expressions;
                expect(character.expressions.map(({ imagePath: _path, ...rest }) => rest)).toEqual(original.map(({ imagePath: _path, ...rest }) => rest));
                for (const [at, expression] of character.expressions.entries()) {
                    expect(expression.imagePath).toMatch(new RegExp(`^expressions/story-${copy.id}/character-${character.id}-${expression.emotion}-[0-9a-f]+\\.(png|jpg)$`));
                    expect(await readFile(path.join(t.imageDir, expression.imagePath))).toEqual(
                        await readFile(path.join(t.imageDir, original[at].imagePath)),
                    );
                }
            }

            // Deleting the source keeps the copy's files.
            await t.http.delete(`/api/stories/${story.id}`).expect(204);
            const copied = copy.characters.flatMap((character) => character.expressions.map((expression) => expression.imagePath)).sort();
            expect(copied).toHaveLength(3);
            expect(await filesUnder(t.imageDir)).toEqual(copied);
        });

        it('goes without an Expression whose file is missing', async () => {
            const story = await createStory();
            const uploaded = ((await upload(story, 'joy', png('joy')).expect(200)).body as Story).characters[0].expressions[0];
            await upload(story, 'fear', png('fear')).expect(200);
            await rm(path.join(t.imageDir, uploaded.imagePath));

            const { body } = await t.http.post(`/api/stories/${story.id}/duplicate`).expect(201);

            expect((body as Story).characters[0].expressions.map((expression) => expression.emotion)).toEqual(['fear']);
        });
    });
});

describe('Expressions through the real gateway', () => {
    let t: TestApp;

    beforeAll(async () => {
        // The real gateway against recorded Venice answers, so the UsageRecord is the real one.
        const net = recordedFetch([
            // The credit check before the draw, then the prompt limits, then the picture.
            { fixture: 'openrouter/credits.json' },
            { fixture: 'venice/balance.json' },
            { fixture: 'venice/models.json' },
            { fixture: 'venice/models.json' },
            { bytes: jpeg('drawn'), contentType: 'image/jpeg' },
        ]);
        t = await startTestApp({ modelGateway: 'real', fetch: net.fetch, providerKeys: TEST_KEYS });
    });

    afterAll(async () => {
        await t.close();
    });

    it("logs one image-pool UsageRecord of its own kind at the Snapshot model's 1K price, which Usage counts", async () => {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const story = (await t.http.post(`/api/stories/${created.body.id}/characters`).send(MIRA).expect(201)).body as Story;
        const characterId = story.characters[0].id;
        // A Reference image put in place directly: drawing one here would need more recorded answers.
        const referencePath = `reference-images/story-${story.id}/character-${characterId}-test.jpg`;
        await mkdir(path.join(t.imageDir, 'reference-images', `story-${story.id}`), { recursive: true });
        await writeFile(path.join(t.imageDir, referencePath), jpeg('reference'));
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        await client.query('UPDATE "character" SET reference_image_path = $1 WHERE id = $2', [referencePath, characterId]);

        const drawn = await t.http.post(`/api/stories/${story.id}/characters/${characterId}/expressions/surprise/draw`).expect(201);
        expect(drawn.body.characters[0].expressions[0]).toMatchObject({ emotion: 'surprise', outdated: false });

        const { rows } = await client.query(
            `SELECT kind, pool, model, host, images, cost_usd AS "costUsd", story_id AS "storyId", chat_id AS "chatId" FROM usage_record ORDER BY id`,
        );
        await client.end();
        expect(rows).toEqual([
            { kind: 'expression_image', pool: 'image', model: 'seedream-v4-edit', host: 'venice', images: 1, costUsd: '0.050000', storyId: story.id, chatId: null },
        ]);

        const usage = await t.http.get('/api/usage').expect(200);
        expect(usage.body.pools.image).toMatchObject({ spentUsd: 0.05, calls: 1, byKind: [{ kind: 'expression_image', spentUsd: 0.05, calls: 1 }] });
        expect(usage.body.pools.text).toMatchObject({ calls: 0 });
    });
});

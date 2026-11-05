import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

import { OutOfCreditError, ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { FakeImageReply } from '../src/service/model-gateway/fake-model-gateway.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { recordedFetch } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface Story {
    id: number;
    characters: Array<{
        id: number;
        name: string;
        appearance: string;
        referenceImagePath: string | null;
        portraitCrop: { x: number; y: number; size: number } | null;
    }>;
}

interface Round {
    candidates: Array<{ id: string }>;
    failed: number;
    failureMessage: string | null;
}

const mira = {
    name: 'Mira',
    appearance: 'Tall, grey-green eyes, black hair tied back, a faint old scar through one eyebrow.',
    personality: 'Guarded and dry, warms slowly.',
    voice: 'Short sentences. Never says please.',
};

/** Four tellable images, so a test can check that the picked one is the one stored. */
function fourImages(prefix = 'candidate'): FakeImageReply[] {
    return [1, 2, 3, 4].map((n) => ({
        image: { bytes: Buffer.from(`${prefix}-${n}-jpeg-bytes`), mimeType: 'image/jpeg' },
    }));
}

async function filesUnder(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .sort();
}

function readBody(response: import('supertest').Response, done: (err: Error | null, body: Buffer) => void) {
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    response.on('end', () => done(null, Buffer.concat(chunks)));
}

describe('Reference images', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    beforeEach(async () => {
        // One app, one image folder for the file: each test starts with it empty.
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

    async function createStoryWithMira(imageStyle = 'ink wash, muted'): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse', imageStyle }).expect(201);
        const added = await t.http.post(`/api/stories/${created.body.id}/characters`).send(mira).expect(201);
        return added.body as Story;
    }

    function candidatesPath(story: Story, characterId = story.characters[0].id): string {
        return `/api/stories/${story.id}/characters/${characterId}/reference-image/candidates`;
    }

    function referenceImagePath(story: Story, characterId = story.characters[0].id): string {
        return `/api/stories/${story.id}/characters/${characterId}/reference-image`;
    }

    async function generate(story: Story): Promise<Round> {
        const response = await t.http.post(candidatesPath(story)).expect(201);
        return response.body as Round;
    }

    async function pick(story: Story, candidateId: string): Promise<Story> {
        const response = await t.http.put(referenceImagePath(story)).send({ candidateId }).expect(200);
        return response.body as Story;
    }

    async function serve(url: string, status = 200): Promise<{ body: Buffer; type: string }> {
        const response = await t.http.get(url).buffer(true).parse(readBody).expect(status);
        return { body: response.body as Buffer, type: response.headers['content-type'] };
    }

    it('makes 4 candidates from Appearance and Image style, serves them, and a pick stores exactly one file', async () => {
        const story = await createStoryWithMira();
        t.gateway.scriptImage('reference_image', ...fourImages());

        const round = await generate(story);

        expect(round.candidates).toHaveLength(4);
        expect(new Set(round.candidates.map((c) => c.id)).size).toBe(4);
        expect(round).toMatchObject({ failed: 0, failureMessage: null });

        // Four reference_image calls, one prompt, each served for this Story.
        const calls = t.gateway.imageCalls('reference_image');
        expect(calls).toHaveLength(4);
        for (const call of calls) {
            expect(call.servedFor).toEqual({ storyId: story.id });
            expect(call.referenceImages ?? []).toEqual([]);
            expect(call.prompt).toContain('Full-body');
            expect(call.prompt).toContain('neutral, relaxed pose');
            expect(call.prompt).toContain('plain, flat, single-colour background');
            expect(call.prompt).toContain('Art style: ink wash, muted.');
            expect(call.prompt).toContain(mira.appearance);
            expect(call.prompt).toContain('Mira');
        }
        expect(new Set(calls.map((call) => call.prompt)).size).toBe(1);

        // Nothing is in the image folder until a pick; the candidates are served from memory.
        expect(await filesUnder(t.imageDir)).toEqual([]);
        const served = await Promise.all(
            round.candidates.map((candidate) => serve(`${candidatesPath(story)}/${candidate.id}`)),
        );
        expect(served.map((s) => s.body.toString()).sort()).toEqual(
            ['candidate-1-jpeg-bytes', 'candidate-2-jpeg-bytes', 'candidate-3-jpeg-bytes', 'candidate-4-jpeg-bytes'],
        );
        expect(served[0].type).toBe('image/jpeg');

        const chosen = round.candidates[2];
        const chosenBytes = (await serve(`${candidatesPath(story)}/${chosen.id}`)).body;
        const picked = await pick(story, chosen.id);

        const stored = picked.characters[0].referenceImagePath;
        expect(stored).toMatch(new RegExp(`^reference-images/story-${story.id}/character-${story.characters[0].id}-[0-9a-f]+\\.jpg$`));
        expect(await filesUnder(t.imageDir)).toEqual([stored]);
        expect((await readFile(path.join(t.imageDir, stored!))).toString()).toBe(chosenBytes.toString());
        // And it is served like any other image.
        const image = await serve(`/api/images/${stored}`);
        expect(image.type).toBe('image/jpeg');
        expect(image.body.toString()).toBe(chosenBytes.toString());

        // The round is gone, the picked candidate included.
        for (const candidate of round.candidates) {
            const gone = await t.http.get(`${candidatesPath(story)}/${candidate.id}`).expect(404);
            expect(gone.body.error.code).toBe('404.002.003');
        }
        const again = await t.http.put(referenceImagePath(story)).send({ candidateId: chosen.id }).expect(404);
        expect(again.body.error.code).toBe('404.002.003');

        // The Story reads back with the path.
        const read = await t.http.get(`/api/stories/${story.id}`).expect(200);
        expect(read.body.characters[0].referenceImagePath).toBe(stored);
    });

    it('a new pick replaces the Reference image and deletes the old file', async () => {
        const story = await createStoryWithMira();
        t.gateway.scriptImage('reference_image', ...fourImages('first'));
        const first = await pick(story, (await generate(story)).candidates[0].id);
        const firstPath = first.characters[0].referenceImagePath!;
        expect(await filesUnder(t.imageDir)).toEqual([firstPath]);

        t.gateway.scriptImage('reference_image', ...fourImages('second'));
        const round = await generate(story);
        // The old image stays until the author picks.
        expect(await filesUnder(t.imageDir)).toEqual([firstPath]);
        const second = await pick(story, round.candidates[3].id);
        const secondPath = second.characters[0].referenceImagePath!;

        expect(secondPath).not.toBe(firstPath);
        expect(await filesUnder(t.imageDir)).toEqual([secondPath]);
        expect((await readFile(path.join(t.imageDir, secondPath))).toString()).toBe('second-4-jpeg-bytes');
        await t.http.get(`/api/images/${firstPath}`).expect(404);
    });

    describe('the Portrait crop', () => {
        function portraitPath(story: Story): string {
            return `${referenceImagePath(story)}/portrait`;
        }

        async function withImage(): Promise<Story> {
            const story = await createStoryWithMira();
            t.gateway.scriptImage('reference_image', ...fourImages());
            await pick(story, (await generate(story)).candidates[0].id);
            return story;
        }

        it('stores the face square, reads back with the Story, and can be cleared', async () => {
            const story = await withImage();
            const crop = { x: 0.25, y: 0.1, size: 0.5 };

            const set = await t.http.put(portraitPath(story)).send(crop).expect(200);
            expect(set.body.characters[0].portraitCrop).toEqual(crop);
            const read = await t.http.get(`/api/stories/${story.id}`).expect(200);
            expect(read.body.characters[0].portraitCrop).toEqual(crop);

            const cleared = await t.http.delete(portraitPath(story)).expect(200);
            expect(cleared.body.characters[0].portraitCrop).toBeNull();
        });

        it('starts empty, and a new Reference image or its removal clears it', async () => {
            const story = await withImage();
            const read = await t.http.get(`/api/stories/${story.id}`).expect(200);
            expect(read.body.characters[0].portraitCrop).toBeNull();

            await t.http.put(portraitPath(story)).send({ x: 0, y: 0, size: 1 }).expect(200);
            t.gateway.scriptImage('reference_image', ...fourImages('second'));
            const replaced = await pick(story, (await generate(story)).candidates[1].id);
            expect(replaced.characters[0].portraitCrop).toBeNull();

            await t.http.put(portraitPath(story)).send({ x: 0, y: 0, size: 1 }).expect(200);
            const removed = await t.http.delete(referenceImagePath(story)).expect(200);
            expect(removed.body.characters[0].portraitCrop).toBeNull();
        });

        it('needs a Reference image to crop from', async () => {
            const story = await createStoryWithMira();
            const refused = await t.http.put(portraitPath(story)).send({ x: 0, y: 0, size: 1 }).expect(409);
            expect(refused.body.error.code).toBe('409.003.009');
        });

        it.each([
            [{ x: -0.1, y: 0, size: 0.5 }],
            [{ x: 0.6, y: 0, size: 0.5 }],
            [{ x: 0, y: 0, size: 0 }],
            [{ x: 0, y: 0, size: 1.2 }],
            [{ x: 0, y: -1, size: 0.5 }],
            [{ x: 0, size: 0.5 }],
        ])('refuses a square outside the image: %o', async (crop) => {
            const story = await withImage();
            await t.http.put(portraitPath(story)).send(crop).expect(400);
        });
    });

    it('a newer round discards the older one, and a candidate belongs to its Character', async () => {
        const story = await createStoryWithMira();
        const other = (await t.http.post(`/api/stories/${story.id}/characters`).send({ ...mira, name: 'Tam' }).expect(201))
            .body as Story;
        const tamId = other.characters[1].id;

        t.gateway.scriptImage('reference_image', ...fourImages('old'), ...fourImages('new'));
        const old = await generate(story);
        const fresh = await generate(story);

        const gone = await t.http.get(`${candidatesPath(story)}/${old.candidates[0].id}`).expect(404);
        expect(gone.body.error.code).toBe('404.002.003');
        await t.http.get(`${candidatesPath(story)}/${fresh.candidates[0].id}`).expect(200);

        // Mira's candidate is not Tam's.
        const wrong = await t.http.put(referenceImagePath(story, tamId)).send({ candidateId: fresh.candidates[0].id }).expect(404);
        expect(wrong.body.error.code).toBe('404.002.003');
        const unknown = await t.http.get(`${candidatesPath(story)}/nope`).expect(404);
        expect(unknown.body.error.code).toBe('404.002.003');
        const noCharacter = await t.http.post(candidatesPath(story, 999999)).expect(404);
        expect(noCharacter.body.error.code).toBe('404.003.002');
    });

    it('needs an Appearance to draw from', async () => {
        const story = await createStoryWithMira();
        const characterId = story.characters[0].id;
        await t.http.patch(`/api/stories/${story.id}/characters/${characterId}`).send({ appearance: '  ' }).expect(200);

        const response = await t.http.post(candidatesPath(story)).expect(422);

        expect(response.body.error.code).toBe('422.002.004');
        expect(t.gateway.imageCalls()).toEqual([]);
    });

    it('works without an Image style, with a default look', async () => {
        const story = await createStoryWithMira('');
        t.gateway.scriptImage('reference_image', ...fourImages());

        await generate(story);

        expect(t.gateway.imageCalls()[0].prompt).toContain('Art style: realistic, natural lighting.');
    });

    describe('deletes', () => {
        it('deleting the Character deletes its Reference image file', async () => {
            const story = await createStoryWithMira();
            t.gateway.scriptImage('reference_image', ...fourImages());
            const picked = await pick(story, (await generate(story)).candidates[0].id);
            const stored = picked.characters[0].referenceImagePath!;
            expect(await filesUnder(t.imageDir)).toEqual([stored]);

            const removed = await t.http.delete(`/api/stories/${story.id}/characters/${story.characters[0].id}`).expect(200);

            expect(removed.body.characters).toEqual([]);
            expect(await filesUnder(t.imageDir)).toEqual([]);
        });

        it('deleting the Story deletes every Reference image file under it', async () => {
            const story = await createStoryWithMira();
            const withTam = (await t.http.post(`/api/stories/${story.id}/characters`).send({ ...mira, name: 'Tam' }).expect(201))
                .body as Story;
            t.gateway.scriptImage('reference_image', ...fourImages('mira'), ...fourImages('tam'));
            await pick(story, (await generate(story)).candidates[0].id);
            const tamId = withTam.characters[1].id;
            const tamRound = (await t.http.post(candidatesPath(story, tamId)).expect(201)).body as Round;
            await t.http.put(referenceImagePath(story, tamId)).send({ candidateId: tamRound.candidates[0].id }).expect(200);
            expect(await filesUnder(t.imageDir)).toHaveLength(2);

            await t.http.delete(`/api/stories/${story.id}`).expect(204);

            expect(await filesUnder(t.imageDir)).toEqual([]);
        });

        it('removing the Reference image deletes the file and clears the path', async () => {
            const story = await createStoryWithMira();
            t.gateway.scriptImage('reference_image', ...fourImages());
            await pick(story, (await generate(story)).candidates[0].id);

            const removed = await t.http.delete(referenceImagePath(story)).expect(200);

            expect(removed.body.characters[0].referenceImagePath).toBeNull();
            expect(await filesUnder(t.imageDir)).toEqual([]);
        });
    });

    describe('credit and failures', () => {
        it('out of image credit (known from the provider) blocks generation before any call', async () => {
            const story = await createStoryWithMira();
            t.gateway.setRemainingCredit({ image: { remainingUsd: 0, limitUsd: 8 } });

            const response = await t.http.post(candidatesPath(story)).expect(402);

            expect(response.body.error.code).toBe('402.001.004');
            expect(t.gateway.imageCalls()).toEqual([]);
        });

        it("out of image credit from the provider's 402 is the same typed error, and play is unaffected", async () => {
            const story = await createStoryWithMira();
            await t.http.patch(`/api/stories/${story.id}`).send({ setting: 'An island.', opening: 'Dark.' }).expect(200);
            await t.http.patch(`/api/stories/${story.id}/role`).send({ name: 'Keeper', description: 'New.' }).expect(200);
            t.gateway.scriptImage(
                'reference_image',
                ...[1, 2, 3, 4].map(() => new OutOfCreditError('image', 'Venice: Insufficient USD or DIEM balance')),
            );

            const response = await t.http.post(candidatesPath(story)).expect(402);

            expect(response.body.error).toEqual({
                code: '402.001.004',
                message: 'Venice: Insufficient USD or DIEM balance',
            });
            expect(await filesUnder(t.imageDir)).toEqual([]);

            // Text play goes on: a Chat starts and is not blocked by the image pool.
            t.gateway.setRemainingCredit({ image: { remainingUsd: 0, limitUsd: 8 } });
            const chat = await t.http.post(`/api/stories/${story.id}/chats`).expect(201);
            expect(chat.body.textCreditOut).toBe(false);
        });

        it('keeps the candidates that came back when some calls fail', async () => {
            const story = await createStoryWithMira();
            const [one, two, three] = fourImages();
            t.gateway.scriptImage('reference_image', one, new ProviderOutageError('Venice: at capacity'), two, three);

            const round = await generate(story);

            expect(round.candidates).toHaveLength(3);
            expect(round.failed).toBe(1);
            expect(round.failureMessage).toBe('Venice: at capacity');
            await t.http.get(`${candidatesPath(story)}/${round.candidates[0].id}`).expect(200);
        });

        it('answers with the typed error when every call fails', async () => {
            const story = await createStoryWithMira();
            t.gateway.scriptImage('reference_image', ...[1, 2, 3, 4].map(() => new ProviderOutageError('Venice: down')));

            const response = await t.http.post(candidatesPath(story)).expect(502);

            expect(response.body.error).toEqual({ code: '502.001.001', message: 'Venice: down' });
        });
    });
});

describe('Reference images through the real gateway', () => {
    let t: TestApp;

    beforeAll(async () => {
        // The real gateway against recorded Venice answers, so the UsageRecords are the real ones.
        const net = recordedFetch([
            // The credit check before the round, then the prompt limits, then the four images.
            { fixture: 'openrouter/credits.json' },
            { fixture: 'venice/balance.json' },
            { fixture: 'venice/models.json' },
            { fixture: 'venice/models.json' },
            { fixture: 'venice/generate.json' },
            { fixture: 'venice/generate.json' },
            { fixture: 'venice/generate.json' },
            { fixture: 'venice/generate.json' },
        ]);
        t = await startTestApp({ modelGateway: 'real', fetch: net.fetch, providerKeys: TEST_KEYS });
    });

    afterAll(async () => {
        await t.close();
    });

    it('writes one image-pool UsageRecord per candidate at list price, against the Story', async () => {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const story = (await t.http.post(`/api/stories/${created.body.id}/characters`).send(mira).expect(201)).body as Story;

        const round = (
            await t.http.post(`/api/stories/${story.id}/characters/${story.characters[0].id}/reference-image/candidates`).expect(201)
        ).body as Round;
        expect(round.candidates).toHaveLength(4);

        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        const { rows } = await client.query(
            `SELECT kind, pool, model, host, images, cost_usd AS "costUsd", story_id AS "storyId", chat_id AS "chatId"
             FROM usage_record ORDER BY id`,
        );
        await client.end();

        expect(rows).toHaveLength(4);
        for (const row of rows) {
            expect(row).toEqual({
                kind: 'reference_image',
                pool: 'image',
                model: 'qwen-image-3',
                host: 'venice',
                images: 1,
                costUsd: '0.040000',
                storyId: story.id,
                chatId: null,
            });
        }

        const usage = await t.http.get('/api/usage');
        expect(usage.status).toBe(200);
        expect(usage.body.pools.image).toMatchObject({ spentUsd: 0.16, calls: 4 });
    });
});

import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { startTestApp, TestApp } from './harness/test-app.js';
import { takeSnapshot as writeAndDraw } from './harness/snapshot.js';

interface Cover {
    source: 'snapshot' | 'reference_image' | 'upload';
    imagePath: string;
    focus: { x: number; y: number } | null;
    snapshotId: number | null;
    characterId: number | null;
}

interface Story {
    id: number;
    title: string;
    characters: Array<{ id: number; name: string; referenceImagePath: string | null }>;
    cover: Cover | null;
}

interface Card {
    id: number;
    coverImagePath: string | null;
    coverFocus: { x: number; y: number } | null;
}

interface Snapshot {
    id: number;
    imagePath: string;
}

const OPENING = `Rain hammers the gallery windows.

@Mira: You're late. Boots off, keeper.`;

const MIRA = {
    name: 'Mira',
    appearance: 'Tall, grey-green eyes, black hair tied back.',
    personality: 'Guarded and dry.',
    voice: 'Short sentences.',
};

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

describe('Story Cover', () => {
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

    /** A playable Story with Mira and Kai; Mira alone has a Reference image. */
    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send(MIRA).expect(201);
        const withCast = await t.http.post(`/api/stories/${storyId}/characters`).send(KAI).expect(201);
        const mira = (withCast.body as Story).characters[0];
        await pickReferenceImage(storyId, mira.id, 'mira-1');
        return getStory(storyId);
    }

    async function pickReferenceImage(storyId: number, characterId: number, label: string): Promise<Story> {
        t.gateway.scriptImage(
            'reference_image',
            ...[1, 2, 3].map(() => ({ image: { bytes: jpeg(label), mimeType: 'image/jpeg' } })),
        );
        const round = await t.http.post(`/api/stories/${storyId}/characters/${characterId}/reference-image/candidates`).expect(201);
        const picked = await t.http
            .put(`/api/stories/${storyId}/characters/${characterId}/reference-image`)
            .send({ candidateId: round.body.candidates[0].id })
            .expect(200);
        t.gateway.reset();
        return picked.body as Story;
    }

    async function getStory(storyId: number): Promise<Story> {
        const { body } = await t.http.get(`/api/stories/${storyId}`).expect(200);
        return body as Story;
    }

    async function card(storyId: number): Promise<Card> {
        const { body } = await t.http.get('/api/stories').expect(200);
        return (body.stories as Card[]).find((story) => story.id === storyId)!;
    }

    /** Takes one Snapshot of a fresh Chat's Opening and waits until it is in the Gallery. */
    async function takeSnapshot(storyId: number, label: string): Promise<Snapshot> {
        const chat = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        t.gateway.scriptText('snapshot_prompt', JSON.stringify({ in_frame: ['Mira'], scene: 'Mira at the window.' }));
        t.gateway.scriptImage('snapshot_image', {
            image: { bytes: jpeg(label), mimeType: 'image/jpeg' },
            model: 'seedream-v5-pro-edit',
            costUsd: 0.05,
        });
        await writeAndDraw(t.http, storyId, chat.body.id);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chat.body.id}/snapshots`).expect(200);
            if (body.jobs.length === 0 && body.snapshots.length > 0) return body.snapshots.at(-1) as Snapshot;
            if (Date.now() > deadline) throw new Error('The Snapshot was not stored in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    function upload(storyId: number, bytes: Buffer, filename = 'cover.png') {
        return t.http.put(`/api/stories/${storyId}/cover/upload`).attach('image', bytes, filename);
    }

    describe('without a Cover', () => {
        it('has none, and the card keeps showing the newest Snapshot', async () => {
            const story = await createStory();
            expect(story.cover).toBeNull();
            expect(await card(story.id)).toMatchObject({ coverImagePath: null, coverFocus: null });

            const snapshot = await takeSnapshot(story.id, 'first');
            expect(await card(story.id)).toMatchObject({ coverImagePath: snapshot.imagePath, coverFocus: null });
        });
    });

    describe('picking a Snapshot', () => {
        it('points at the Snapshot without copying its file, and wins over newer Snapshots on the card', async () => {
            const story = await createStory();
            const chosen = await takeSnapshot(story.id, 'chosen');
            const filesBefore = await filesUnder(t.imageDir);

            const { body } = await t.http.put(`/api/stories/${story.id}/cover`).send({ snapshotId: chosen.id }).expect(200);
            expect(body.cover).toEqual({
                source: 'snapshot',
                imagePath: chosen.imagePath,
                focus: null,
                snapshotId: chosen.id,
                characterId: null,
            });
            expect(await filesUnder(t.imageDir)).toEqual(filesBefore);

            await takeSnapshot(story.id, 'newer');
            expect((await card(story.id)).coverImagePath).toBe(chosen.imagePath);
        });

        it('keeps the Snapshot and its file when the Cover is cleared', async () => {
            const story = await createStory();
            const snapshot = await takeSnapshot(story.id, 'kept');
            await t.http.put(`/api/stories/${story.id}/cover`).send({ snapshotId: snapshot.id }).expect(200);

            const { body } = await t.http.delete(`/api/stories/${story.id}/cover`).expect(200);
            expect(body.cover).toBeNull();
            expect(await filesUnder(t.imageDir)).toContain(snapshot.imagePath);
            await t.http.get(`/api/stories/${story.id}/snapshots/${snapshot.id}`).expect(200);
        });

        it('goes when its Snapshot is deleted, and the card falls back to the newest Snapshot left', async () => {
            const story = await createStory();
            const older = await takeSnapshot(story.id, 'older');
            const chosen = await takeSnapshot(story.id, 'chosen');
            await t.http.put(`/api/stories/${story.id}/cover`).send({ snapshotId: chosen.id }).expect(200);
            await t.http.put(`/api/stories/${story.id}/cover/focus`).send({ x: 0.2, y: 0.8 }).expect(200);

            await t.http.delete(`/api/stories/${story.id}/snapshots/${chosen.id}`).expect(204);
            expect((await getStory(story.id)).cover).toBeNull();
            expect(await card(story.id)).toMatchObject({ coverImagePath: older.imagePath, coverFocus: null });
        });

        it('lets the Story be deleted with its Gallery while a Snapshot is the Cover', async () => {
            const story = await createStory();
            const snapshot = await takeSnapshot(story.id, 'deleted with');
            await t.http.put(`/api/stories/${story.id}/cover`).send({ snapshotId: snapshot.id }).expect(200);

            await t.http.delete(`/api/stories/${story.id}`).expect(204);
            await t.http.get(`/api/stories/${story.id}`).expect(404);
            expect(await filesUnder(t.imageDir)).not.toContain(snapshot.imagePath);
        });

        it("refuses another Story's Snapshot", async () => {
            const story = await createStory();
            const other = await createStory();
            const theirs = await takeSnapshot(other.id, 'theirs');

            const { body } = await t.http.put(`/api/stories/${story.id}/cover`).send({ snapshotId: theirs.id }).expect(404);
            expect(body.error.code).toBe('404.002.005');
        });
    });

    describe("picking a Character's Reference image", () => {
        it('shows the Reference image and follows it when it is replaced', async () => {
            const story = await createStory();
            const mira = story.characters[0];

            const { body } = await t.http.put(`/api/stories/${story.id}/cover`).send({ characterId: mira.id }).expect(200);
            expect(body.cover).toEqual({
                source: 'reference_image',
                imagePath: mira.referenceImagePath,
                focus: null,
                snapshotId: null,
                characterId: mira.id,
            });
            expect((await card(story.id)).coverImagePath).toBe(mira.referenceImagePath);

            const replaced = await pickReferenceImage(story.id, mira.id, 'mira-2');
            const newPath = replaced.characters[0].referenceImagePath;
            expect(newPath).not.toBe(mira.referenceImagePath);
            expect(replaced.cover).toMatchObject({ source: 'reference_image', imagePath: newPath });
        });

        it('goes when the Reference image is removed, and leaves the file to the Character until then', async () => {
            const story = await createStory();
            const mira = story.characters[0];
            await t.http.put(`/api/stories/${story.id}/cover`).send({ characterId: mira.id }).expect(200);

            await t.http.delete(`/api/stories/${story.id}/cover`).expect(200);
            expect(await filesUnder(t.imageDir)).toContain(mira.referenceImagePath);

            await t.http.put(`/api/stories/${story.id}/cover`).send({ characterId: mira.id }).expect(200);
            const { body } = await t.http.delete(`/api/stories/${story.id}/characters/${mira.id}/reference-image`).expect(200);
            expect(body.cover).toBeNull();

            // A new Reference image does not bring the old Cover back.
            expect((await pickReferenceImage(story.id, mira.id, 'mira-3')).cover).toBeNull();
        });

        it('refuses a Character with no Reference image, and one from another Story', async () => {
            const story = await createStory();
            const kai = story.characters[1];
            const refused = await t.http.put(`/api/stories/${story.id}/cover`).send({ characterId: kai.id }).expect(409);
            expect(refused.body.error.code).toBe('409.003.012');

            const other = await createStory();
            const missing = await t.http
                .put(`/api/stories/${story.id}/cover`)
                .send({ characterId: other.characters[0].id })
                .expect(404);
            expect(missing.body.error.code).toBe('404.003.002');
        });
    });

    describe('choosing', () => {
        it('needs exactly one of a Snapshot and a Character', async () => {
            const story = await createStory();
            const snapshot = await takeSnapshot(story.id, 'one');

            const both = await t.http
                .put(`/api/stories/${story.id}/cover`)
                .send({ snapshotId: snapshot.id, characterId: story.characters[0].id })
                .expect(422);
            expect(both.body.error.code).toBe('422.003.010');
            const neither = await t.http.put(`/api/stories/${story.id}/cover`).send({}).expect(422);
            expect(neither.body.error.code).toBe('422.003.010');
            await t.http.put(`/api/stories/${story.id}/cover`).send({ snapshotId: 'first' }).expect(400);
        });

        it('answers 404 for a Story that is not there', async () => {
            const { body } = await t.http.put('/api/stories/999999/cover').send({ characterId: 1 }).expect(404);
            expect(body.error.code).toBe('404.003.001');
        });
    });

    describe('uploading', () => {
        it('stores the picture as a file the Cover owns, served like any image', async () => {
            const story = await createStory();
            const { body } = await upload(story.id, png('uploaded')).expect(200);

            expect(body.cover).toMatchObject({ source: 'upload', focus: null, snapshotId: null, characterId: null });
            expect(body.cover.imagePath).toMatch(new RegExp(`^covers/story-${story.id}/cover-[0-9a-f]+\\.png$`));
            const served = await t.http.get(`/api/images/${body.cover.imagePath}`).expect(200);
            expect(served.headers['content-type']).toBe('image/png');
            expect((await card(story.id)).coverImagePath).toBe(body.cover.imagePath);
        });

        it('reads the type from the bytes, not the file name', async () => {
            const story = await createStory();
            const { body } = await upload(story.id, jpeg('really a jpeg'), 'photo.png').expect(200);
            expect(body.cover.imagePath).toMatch(/\.jpg$/);
        });

        it('deletes its own file when replaced by another upload, a Snapshot, or cleared', async () => {
            const story = await createStory();
            const snapshot = await takeSnapshot(story.id, 'gallery');

            const first = (await upload(story.id, png('first')).expect(200)).body.cover.imagePath as string;
            const second = (await upload(story.id, png('second')).expect(200)).body.cover.imagePath as string;
            let files = await filesUnder(t.imageDir);
            expect(files).not.toContain(first);
            expect(files).toContain(second);

            await t.http.put(`/api/stories/${story.id}/cover`).send({ snapshotId: snapshot.id }).expect(200);
            files = await filesUnder(t.imageDir);
            expect(files).not.toContain(second);
            expect(files).toContain(snapshot.imagePath);

            const third = (await upload(story.id, png('third')).expect(200)).body.cover.imagePath as string;
            await t.http.delete(`/api/stories/${story.id}/cover`).expect(200);
            expect(await filesUnder(t.imageDir)).not.toContain(third);
            // The Snapshot was only pointed at; replacing it as the Cover left it alone.
            expect(await filesUnder(t.imageDir)).toContain(snapshot.imagePath);
        });

        it('refuses a file that is not a PNG, JPEG or WebP, and writes nothing', async () => {
            const story = await createStory();
            const before = await filesUnder(t.imageDir);
            const { body } = await upload(story.id, Buffer.from('GIF89a not allowed'), 'cover.gif').expect(415);
            expect(body.error.code).toBe('415.002.009');
            expect(await filesUnder(t.imageDir)).toEqual(before);
            expect((await getStory(story.id)).cover).toBeNull();
        });

        it('refuses a request without a file, and a file over 15 MB', async () => {
            const story = await createStory();
            const empty = await t.http.put(`/api/stories/${story.id}/cover/upload`).field('note', 'no file').expect(400);
            expect(empty.body.error.code).toBe('400.002.008');

            const huge = Buffer.concat([png('huge'), Buffer.alloc(15 * 1024 * 1024)]);
            const tooLarge = await upload(story.id, huge).expect(413);
            expect(tooLarge.body.error.code).toBe('413.002.010');
            expect((await getStory(story.id)).cover).toBeNull();
        });

        it('goes with the Story when the Story is deleted', async () => {
            const story = await createStory();
            const { body } = await upload(story.id, png('doomed')).expect(200);
            await t.http.delete(`/api/stories/${story.id}`).expect(204);
            expect(await filesUnder(t.imageDir)).not.toContain(body.cover.imagePath);
        });
    });

    describe('focus point', () => {
        it('is kept on the Cover and reaches the card, and a new Cover starts centred', async () => {
            const story = await createStory();
            await upload(story.id, png('focus')).expect(200);

            const { body } = await t.http.put(`/api/stories/${story.id}/cover/focus`).send({ x: 0.25, y: 0.1 }).expect(200);
            expect(body.cover.focus).toEqual({ x: 0.25, y: 0.1 });
            expect((await card(story.id)).coverFocus).toEqual({ x: 0.25, y: 0.1 });

            const cleared = await t.http.delete(`/api/stories/${story.id}/cover/focus`).expect(200);
            expect(cleared.body.cover.focus).toBeNull();

            await t.http.put(`/api/stories/${story.id}/cover/focus`).send({ x: 0.9, y: 0.9 }).expect(200);
            const next = await t.http.put(`/api/stories/${story.id}/cover`).send({ characterId: story.characters[0].id }).expect(200);
            expect(next.body.cover.focus).toBeNull();
        });

        it('needs a Cover, and a point inside the picture', async () => {
            const story = await createStory();
            const none = await t.http.put(`/api/stories/${story.id}/cover/focus`).send({ x: 0.5, y: 0.5 }).expect(409);
            expect(none.body.error.code).toBe('409.003.011');

            await upload(story.id, png('bounds')).expect(200);
            await t.http.put(`/api/stories/${story.id}/cover/focus`).send({ x: 1.2, y: 0.5 }).expect(400);
            await t.http.put(`/api/stories/${story.id}/cover/focus`).send({ x: 0.5 }).expect(400);
        });
    });

    describe('alongside the editor', () => {
        it('survives saves of the Story, its Role and its Characters', async () => {
            const story = await createStory();
            const { body: covered } = await upload(story.id, png('stays')).expect(200);
            await t.http.put(`/api/stories/${story.id}/cover/focus`).send({ x: 0.3, y: 0.6 }).expect(200);

            await t.http.patch(`/api/stories/${story.id}`).send({ title: 'The Lighthouse, renamed' }).expect(200);
            await t.http.patch(`/api/stories/${story.id}/role`).send({ name: 'Ash Vale' }).expect(200);
            const { body } = await t.http.patch(`/api/stories/${story.id}/characters/${story.characters[1].id}`).send({ voice: 'Loud.' }).expect(200);

            expect(body.title).toBe('The Lighthouse, renamed');
            expect(body.cover).toEqual({ ...covered.cover, focus: { x: 0.3, y: 0.6 } });
        });
    });
});

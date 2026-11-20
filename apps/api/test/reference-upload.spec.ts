import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Uploading a Reference image (.scratch/reference-upload/spec.md): a picture from the author's own
 * files becomes a Character's Reference image, replacing the old one and its file, as a picked
 * candidate does; anything that isn't a picture is refused, changing nothing.
 */

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

describe('Uploading a Reference image', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createCharacter(): Promise<{ storyId: number; characterId: number }> {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Moonwood' }).expect(201)).body.id as number;
        const added = await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Odile', appearance: 'Pink hair.' }).expect(201);
        return { storyId, characterId: added.body.characters[0].id as number };
    }

    const upload = (storyId: number, characterId: number, bytes: Buffer, filename = 'odile.png') =>
        t.http.put(`/api/stories/${storyId}/characters/${characterId}/reference-image/upload`).attach('image', bytes, filename);
    const referenceFiles = async (storyId: number) => (await filesUnder(t.imageDir)).filter((file) => file.startsWith(`reference-images/story-${storyId}/`));

    it('makes the upload the Reference image, typed by its bytes and served; another replaces it and its file, and resets the face', async () => {
        const { storyId, characterId } = await createCharacter();

        const first = (await upload(storyId, characterId, jpeg('first'), 'looks-like.png').expect(200)).body.characters[0];
        expect(first.referenceImagePath).toMatch(new RegExp(`^reference-images/story-${storyId}/character-${characterId}-[0-9a-f]+\\.jpg$`));
        expect((await t.http.get(`/api/images/${first.referenceImagePath}`).expect(200)).headers['content-type']).toBe('image/jpeg');

        await t.http.put(`/api/stories/${storyId}/characters/${characterId}/reference-image/portrait`).send({ x: 0.2, y: 0.1, size: 0.5 }).expect(200);
        const second = (await upload(storyId, characterId, png('second')).expect(200)).body.characters[0];
        expect(second.referenceImagePath).not.toBe(first.referenceImagePath);
        expect(second.portraitCrop).toBeNull();
        expect(await referenceFiles(storyId)).toEqual([second.referenceImagePath]);
    });

    it('refuses what is not a picture, a missing file and an unknown Character, changing nothing', async () => {
        const { storyId, characterId } = await createCharacter();
        const kept = (await upload(storyId, characterId, png('kept')).expect(200)).body.characters[0].referenceImagePath as string;

        expect((await upload(storyId, characterId, Buffer.from('not an image'), 'note.png').expect(415)).body.error.code).toBe('415.002.009');
        expect((await t.http.put(`/api/stories/${storyId}/characters/${characterId}/reference-image/upload`).expect(400)).body.error.code).toBe('400.002.008');
        await upload(storyId, characterId + 100_000, png('nobody')).expect(404);

        expect(await referenceFiles(storyId)).toEqual([kept]);
        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.characters[0].referenceImagePath).toBe(kept);
    });
});

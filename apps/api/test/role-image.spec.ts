import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { SESSION_COOKIE, sessionKey, signSession } from '../src/api/auth/session.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountRole } from '../src/model/account/entities/account.entity.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Role image (.scratch/role-image/spec.md): the Role's own picture, uploaded, replaced, cleared,
 * copied by Duplicate and deleted with the Story; served only to the Story's Account; and named in
 * its Chats for the user's lines written as the Role.
 */

const SECRET = 'x'.repeat(40);
const DAY = 24 * 60 * 60 * 1000;

/** A real PNG signature followed by filler: the store reads the type from the first bytes. */
function png(label: string): Buffer {
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from(label)]);
}

async function filesUnder(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .sort();
}

describe('Role image', () => {
    let t: TestApp;
    let owner: string;
    let member: string;

    beforeAll(async () => {
        t = await startTestApp({ loginPassword: 'lantern-keeper-1890', sessionSecret: SECRET });
        const accounts = t.app.get(AccountModelService);
        const other = await accounts.save({ email: 'other@example.com', role: AccountRole.Member, monthlyCapUsd: 5 });
        const cookie = (id: number) => `${SESSION_COOKIE}=${signSession(sessionKey(SECRET), id, Date.now() + 60 * DAY)}`;
        owner = cookie(accounts.owner.id);
        member = cookie(other.id);
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createStory(): Promise<number> {
        const storyId = (await t.http.post('/api/stories').set('Cookie', owner).send({ title: 'The Moonwood' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).set('Cookie', owner).send({ setting: 'A silver forest.', opening: '@Mira: Who goes there?' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).set('Cookie', owner).send({ name: 'Rin', description: 'A fox reborn.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).set('Cookie', owner).send({ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' }).expect(201);
        return storyId;
    }

    const upload = (storyId: number, bytes: Buffer, cookie = owner) => t.http.put(`/api/stories/${storyId}/role/image`).set('Cookie', cookie).attach('image', bytes, 'rin.png');
    const roleFiles = async () => (await filesUnder(t.imageDir)).filter((file) => file.startsWith('role-images/'));

    it('a new Role has no picture; an upload gives it one, served as an image; another replaces it, leaving one file', async () => {
        const storyId = await createStory();
        expect((await t.http.get(`/api/stories/${storyId}`).set('Cookie', owner).expect(200)).body.role.imagePath).toBeNull();

        const first = (await upload(storyId, png('first')).expect(200)).body.role.imagePath as string;
        expect(first).toMatch(new RegExp(`^role-images/story-${storyId}/picture-[0-9a-f]+\\.png$`));
        expect((await t.http.get(`/api/images/${first}`).set('Cookie', owner).expect(200)).headers['content-type']).toBe('image/png');

        const second = (await upload(storyId, png('second')).expect(200)).body.role.imagePath as string;
        expect(second).not.toBe(first);
        expect((await roleFiles()).filter((file) => file.startsWith(`role-images/story-${storyId}/`))).toEqual([second]);
        // Editing the Role's text keeps it.
        expect((await t.http.patch(`/api/stories/${storyId}/role`).set('Cookie', owner).send({ description: 'Changed.' }).expect(200)).body.role.imagePath).toBe(second);
    });

    it('refuses what is not a picture and a missing file, changing nothing', async () => {
        const storyId = await createStory();
        const kept = (await upload(storyId, png('kept')).expect(200)).body.role.imagePath as string;
        const before = await roleFiles();

        expect((await t.http.put(`/api/stories/${storyId}/role/image`).set('Cookie', owner).attach('image', Buffer.from('not an image'), 'note.png').expect(415)).body.error.code).toBe(
            '415.002.009',
        );
        expect((await t.http.put(`/api/stories/${storyId}/role/image`).set('Cookie', owner).expect(400)).body.error.code).toBe('400.002.008');
        await upload(storyId + 100_000, png('nobody')).expect(404);

        expect(await roleFiles()).toEqual(before);
        expect((await t.http.get(`/api/stories/${storyId}`).set('Cookie', owner).expect(200)).body.role.imagePath).toBe(kept);
    });

    it('clearing it and deleting the Story each delete the file; Duplicate gives the copy a file of its own', async () => {
        const storyId = await createStory();
        const first = (await upload(storyId, png('one')).expect(200)).body.role.imagePath as string;
        expect((await t.http.delete(`/api/stories/${storyId}/role/image`).set('Cookie', owner).expect(200)).body.role.imagePath).toBeNull();
        expect(await roleFiles()).not.toContain(first);
        // Clearing again is nothing to do, not an error.
        await t.http.delete(`/api/stories/${storyId}/role/image`).set('Cookie', owner).expect(200);

        const second = (await upload(storyId, png('two')).expect(200)).body.role.imagePath as string;
        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).set('Cookie', owner).expect(201)).body;
        expect(copy.role.imagePath).toMatch(new RegExp(`^role-images/story-${copy.id}/picture-[0-9a-f]+\\.png$`));
        await t.http.get(`/api/images/${copy.role.imagePath}`).set('Cookie', owner).expect(200);

        await t.http.delete(`/api/stories/${storyId}`).set('Cookie', owner).expect(204);
        expect(await roleFiles()).not.toContain(second);
        // The copy's own file is untouched by the source going.
        expect(await roleFiles()).toContain(copy.role.imagePath);
    });

    it("serves the Role's picture only to the Story's Account, and lets no other Account change it", async () => {
        const storyId = await createStory();
        const imagePath = (await upload(storyId, png('private')).expect(200)).body.role.imagePath as string;
        await t.http.get(`/api/images/${imagePath}`).set('Cookie', member).expect(404);
        await upload(storyId, png('theirs'), member).expect(404);
        await t.http.delete(`/api/stories/${storyId}/role/image`).set('Cookie', member).expect(404);
        await t.http.get(`/api/images/${imagePath}`).set('Cookie', owner).expect(200);
    });

    it("a Chat names the Role's picture, for the user's lines written as the Role", async () => {
        const storyId = await createStory();
        const chatPath = (id: number) => `/api/stories/${storyId}/chats/${id}`;
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).set('Cookie', owner).expect(201)).body;
        expect(chat.roleImagePath).toBeNull();

        const imagePath = (await upload(storyId, png('rin')).expect(200)).body.role.imagePath as string;
        expect((await t.http.get(chatPath(chat.id)).set('Cookie', owner).expect(200)).body.roleImagePath).toBe(imagePath);

        await t.http.delete(`/api/stories/${storyId}/role/image`).set('Cookie', owner).expect(200);
        expect((await t.http.get(chatPath(chat.id)).set('Cookie', owner).expect(200)).body.roleImagePath).toBeNull();
    });
});

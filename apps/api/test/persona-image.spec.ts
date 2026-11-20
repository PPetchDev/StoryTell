import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { SESSION_COOKIE, sessionKey, signSession } from '../src/api/auth/session.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountRole } from '../src/model/account/entities/account.entity.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Persona image (.scratch/persona-image/spec.md): a Persona's own picture, uploaded, replaced,
 * cleared and deleted with it; served only to its Account; and named in the Chats that show it.
 */

const SECRET = 'x'.repeat(40);
const DAY = 24 * 60 * 60 * 1000;

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

describe('Persona image', () => {
    let t: TestApp;
    let owner: string;
    let member: string;

    beforeAll(async () => {
        t = await startTestApp({ loginPassword: 'lantern-keeper-1890', sessionSecret: SECRET });
        const accounts = t.app.get(AccountModelService);
        const rin = await accounts.save({ email: 'rin@example.com', role: AccountRole.Member, monthlyCapUsd: 5 });
        const cookie = (id: number) => `${SESSION_COOKIE}=${signSession(sessionKey(SECRET), id, Date.now() + 60 * DAY)}`;
        owner = cookie(accounts.owner.id);
        member = cookie(rin.id);
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createPersona(name: string, cookie = owner): Promise<{ id: number; imagePath: string | null }> {
        return (await t.http.post('/api/personas').set('Cookie', cookie).send({ name, description: 'A keeper.' }).expect(201)).body;
    }

    function upload(personaId: number, bytes: Buffer, cookie = owner, filename = 'me.png') {
        return t.http.put(`/api/personas/${personaId}/image`).set('Cookie', cookie).attach('image', bytes, filename);
    }

    const personaFiles = async () => (await filesUnder(t.imageDir)).filter((file) => file.startsWith('personas/'));

    it('a new Persona has no picture; an upload gives it one, typed by its bytes and served as an image', async () => {
        const persona = await createPersona('Ash');
        expect(persona.imagePath).toBeNull();

        const { body } = await upload(persona.id, png('first')).expect(200);
        expect(body).toMatchObject({ id: persona.id, name: 'Ash' });
        expect(body.imagePath).toMatch(new RegExp(`^personas/persona-${persona.id}/picture-[0-9a-f]+\\.png$`));
        const served = await t.http.get(`/api/images/${body.imagePath}`).set('Cookie', owner).expect(200);
        expect(served.headers['content-type']).toBe('image/png');

        // The list and the Persona itself answer with it.
        const list = await t.http.get('/api/personas').set('Cookie', owner).expect(200);
        expect((list.body.personas as Array<{ id: number; imagePath: string | null }>).find((other) => other.id === persona.id)?.imagePath).toBe(body.imagePath);
        expect((await t.http.get(`/api/personas/${persona.id}`).set('Cookie', owner).expect(200)).body.imagePath).toBe(body.imagePath);

        // A JPEG named .png is kept as what it is.
        const second = await upload(persona.id, jpeg('really a jpeg'), owner, 'photo.png').expect(200);
        expect(second.body.imagePath).toMatch(/\.jpg$|\.jpeg$/);
        // The replaced file is gone, and only the new one is left.
        expect(await personaFiles()).toEqual([second.body.imagePath]);
        // A rename keeps the picture.
        const renamed = await t.http.patch(`/api/personas/${persona.id}`).set('Cookie', owner).send({ name: 'Ashen' }).expect(200);
        expect(renamed.body.imagePath).toBe(second.body.imagePath);
    });

    it('refuses what is not a picture, a missing file and one too large, changing nothing', async () => {
        const persona = await createPersona('Bryn');
        const kept = (await upload(persona.id, png('kept')).expect(200)).body.imagePath as string;
        const before = await personaFiles();

        const text = await upload(persona.id, Buffer.from('not an image at all'), owner, 'note.png').expect(415);
        expect(text.body.error.code).toBe('415.002.009');
        const none = await t.http.put(`/api/personas/${persona.id}/image`).set('Cookie', owner).expect(400);
        expect(none.body.error.code).toBe('400.002.008');
        const huge = Buffer.concat([png('huge'), Buffer.alloc(15 * 1024 * 1024)]);
        const large = await upload(persona.id, huge).expect(413);
        expect(large.body.error.code).toBe('413.002.010');
        await upload(persona.id + 100_000, png('nobody')).expect(404);

        expect(await personaFiles()).toEqual(before);
        expect((await t.http.get(`/api/personas/${persona.id}`).set('Cookie', owner).expect(200)).body.imagePath).toBe(kept);
    });

    it('clearing the picture and deleting the Persona each delete the file', async () => {
        const persona = await createPersona('Cole');
        const first = (await upload(persona.id, png('one')).expect(200)).body.imagePath as string;
        const cleared = await t.http.delete(`/api/personas/${persona.id}/image`).set('Cookie', owner).expect(200);
        expect(cleared.body.imagePath).toBeNull();
        expect(await personaFiles()).not.toContain(first);
        await t.http.get(`/api/images/${first}`).set('Cookie', owner).expect(404);
        // Clearing again is nothing to do, not an error.
        await t.http.delete(`/api/personas/${persona.id}/image`).set('Cookie', owner).expect(200);

        const second = (await upload(persona.id, png('two')).expect(200)).body.imagePath as string;
        await t.http.delete(`/api/personas/${persona.id}`).set('Cookie', owner).expect(204);
        expect(await personaFiles()).not.toContain(second);
    });

    it("serves a Persona's picture only to its Account, and lets no other Account change it", async () => {
        const mine = await createPersona('Dara');
        const imagePath = (await upload(mine.id, png('private')).expect(200)).body.imagePath as string;

        await t.http.get(`/api/images/${imagePath}`).set('Cookie', member).expect(404);
        await upload(mine.id, png('theirs'), member).expect(404);
        await t.http.delete(`/api/personas/${mine.id}/image`).set('Cookie', member).expect(404);
        // A path under personas/ that is nobody's folder is nobody's to read.
        await t.http.get('/api/images/personas/stray.png').set('Cookie', owner).expect(404);

        // Still the owner's, untouched.
        await t.http.get(`/api/images/${imagePath}`).set('Cookie', owner).expect(200);
        const theirs = await createPersona('Rin', member);
        const theirPath = (await upload(theirs.id, png('rin'), member).expect(200)).body.imagePath as string;
        await t.http.get(`/api/images/${theirPath}`).set('Cookie', member).expect(200);
        await t.http.get(`/api/images/${theirPath}`).set('Cookie', owner).expect(404);
    });

    it('a Chat names the pictures of the Personas it shows: the worn one, and those its Messages were written as', async () => {
        const created = await t.http.post('/api/stories').set('Cookie', owner).send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).set('Cookie', owner).send({ setting: 'A lighthouse.', opening: '@Mira: Boots off, keeper.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).set('Cookie', owner).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).set('Cookie', owner).send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' }).expect(201);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).set('Cookie', owner).expect(201)).body as { id: number; personaImages: unknown[] };
        expect(chat.personaImages).toEqual([]);

        const pictured = await createPersona('Eda');
        const plain = await createPersona('Finn');
        const unused = await createPersona('Gale');
        const edaPath = (await upload(pictured.id, png('eda')).expect(200)).body.imagePath as string;
        await upload(unused.id, png('gale')).expect(200);
        const chatPath = `/api/stories/${storyId}/chats/${chat.id}`;

        // Worn: named at once, before any Message is written as it.
        const worn = await t.http.put(`${chatPath}/identity`).set('Cookie', owner).send({ personaId: pictured.id }).expect(200);
        expect(worn.body.personaImages).toEqual([{ personaId: pictured.id, imagePath: edaPath, crop: null }]);

        t.gateway.scriptText('turn', { text: '@Mira: Heard.', model: 'glm-5.3' });
        t.gateway.scriptText('judge', '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"not yet"}}');
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
        await t.http.post(`${chatPath}/messages`).set('Cookie', owner).send({ text: 'I climb.' }).expect(201);

        // Another Persona is worn now, one without a picture: the first is still named, for the Message written as it.
        const swapped = await t.http.put(`${chatPath}/identity`).set('Cookie', owner).send({ personaId: plain.id }).expect(200);
        expect(swapped.body.personaImages).toEqual([{ personaId: pictured.id, imagePath: edaPath, crop: null }]);
        // Back to the Role: the same, and never a Persona this Chat does not show.
        const role = await t.http.put(`${chatPath}/identity`).set('Cookie', owner).send({ personaId: null }).expect(200);
        expect(role.body.personaImages).toEqual([{ personaId: pictured.id, imagePath: edaPath, crop: null }]);

        // Its picture cleared, or the Persona deleted: the Chat names none.
        await t.http.delete(`/api/personas/${pictured.id}/image`).set('Cookie', owner).expect(200);
        expect((await t.http.get(chatPath).set('Cookie', owner).expect(200)).body.personaImages).toEqual([]);
    });
});

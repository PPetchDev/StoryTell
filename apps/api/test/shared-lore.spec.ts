import { SESSION_COOKIE, sessionKey, signSession } from '../src/api/auth/session.js';
import { writeCard } from '../src/manager/character-card/card-writer.js';
import { promptLore } from '../src/manager/chat/lore/lore-select.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountRole } from '../src/model/account/entities/account.entity.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Shared Lore (.scratch/shared-lore/spec.md): Lore sets an Account keeps apart from any one Story
 * and links to several. Made, linked, edited and deleted through the HTTP API; then what a
 * Chat's prompts carry, with the fake gateway scripted.
 */

const SECRET = 'x'.repeat(40);
const DAY = 24 * 60 * 60 * 1000;
const NO_OPS = '{"operations":[]}';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"not yet"}}';

interface Entry {
    id: number;
    name: string;
    keywords: string[];
    text: string;
    alwaysOn: boolean;
}

interface LoreSet {
    id: number;
    name: string;
    entries: Entry[];
    usedBy: number;
}

interface Story {
    id: number;
    lore: Entry[];
    loreSets: LoreSet[];
}

describe('Shared Lore: the order prompts read it in (pure)', () => {
    it("reads a Story's own entries first, then each linked set's, and only its own where the sets were not loaded", () => {
        const entry = (id: number, name: string) => ({
            id,
            name,
            keywords: [],
            text: `${name}.`,
            alwaysOn: false,
            secondaryKeywords: [],
            secondaryMode: 'alsoNeeds' as const,
            patterns: [],
            recursable: true,
            sticky: 0,
            cooldown: 0,
            delay: 0,
            chance: 100,
            group: '',
        });
        const story = {
            lore: [entry(1, 'Own')],
            loreSetLinks: [{ loreSet: { entries: [entry(5, 'First set')] } }, { loreSet: null }, { loreSet: { entries: [entry(3, 'Second set a'), entry(4, 'Second set b')] } }],
        };
        expect(promptLore(story).map((read) => read.name)).toEqual(['Own', 'First set', 'Second set a', 'Second set b']);
        expect(promptLore({ lore: [entry(1, 'Own')] }).map((read) => read.name)).toEqual(['Own']);
    });
});

describe('Shared Lore (HTTP)', () => {
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

    const as = (cookie: string) => ({
        get: (url: string) => t.http.get(url).set('Cookie', cookie),
        post: (url: string) => t.http.post(url).set('Cookie', cookie),
        put: (url: string) => t.http.put(url).set('Cookie', cookie),
        patch: (url: string) => t.http.patch(url).set('Cookie', cookie),
        delete: (url: string) => t.http.delete(url).set('Cookie', cookie),
    });
    const me = () => as(owner);

    async function createStory(title: string, cookie = owner): Promise<number> {
        const http = as(cookie);
        const created = await http.post('/api/stories').send({ title }).expect(201);
        const storyId = created.body.id as number;
        await http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse.', opening: '@Mira: Boots off, keeper.' }).expect(200);
        await http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' }).expect(201);
        return storyId;
    }

    const story = async (storyId: number): Promise<Story> => (await me().get(`/api/stories/${storyId}`).expect(200)).body as Story;
    const sets = async (cookie = owner) =>
        (await as(cookie).get('/api/lore-sets').expect(200)).body.loreSets as Array<{ id: number; name: string; entries: number; stories: Array<{ id: number; title: string }> }>;

    function lastTurn(): TextCompletionRequest {
        const calls = t.gateway.textCalls('turn');
        return calls[calls.length - 1];
    }

    async function send(storyId: number, chatId: number, text: string): Promise<string> {
        t.gateway.scriptText('turn', { text: '@Mira: Heard.', model: 'glm-5.3' });
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await me().post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await me().get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as { messages: Array<{ judge?: { status: string } | null }> };
            if (chat.messages.at(-1)?.judge?.status !== 'pending') break;
            if (Date.now() > deadline) throw new Error('The judge did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return lastTurn().messages.at(-1)!.content;
    }

    it('a new Lore set is linked to the Story it is made in, takes entries like a Story does, and is listed for the picker', async () => {
        const storyId = await createStory('The Lighthouse');
        expect((await story(storyId)).loreSets).toEqual([]);
        expect(await sets()).toEqual([]);

        const created = await me().post(`/api/stories/${storyId}/lore-sets`).send({ name: ' The Salt Coast ' }).expect(201);
        const [set] = (created.body as Story).loreSets;
        expect(set).toEqual({ id: set.id, name: 'The Salt Coast', entries: [], usedBy: 1 });
        expect((created.body as Story).lore).toEqual([]);

        const added = await me()
            .post(`/api/stories/${storyId}/lore-sets/${set.id}/entries`)
            .send({ name: 'Wreckers', keywords: [' wrecker ', '', 'false light'], text: 'They lure ships with false lights.' })
            .expect(201);
        const [entry] = (added.body as Story).loreSets[0].entries;
        expect(entry).toMatchObject({ name: 'Wreckers', keywords: ['wrecker', 'false light'], text: 'They lure ships with false lights.', alwaysOn: false, chance: 100 });
        // It is the set's, not the Story's own.
        expect((added.body as Story).lore).toEqual([]);

        const entryPath = `/api/stories/${storyId}/lore-sets/${set.id}/entries/${entry.id}`;
        const always = await me().patch(entryPath).send({ alwaysOn: true, text: 'They lure ships onto the reef.' }).expect(200);
        expect((always.body as Story).loreSets[0].entries[0]).toMatchObject({ alwaysOn: true, text: 'They lure ships onto the reef.', name: 'Wreckers' });
        // The same checks a Story's own entry has: a pattern that does not compile is refused.
        const bad = await me().patch(entryPath).send({ patterns: ['('] }).expect(422);
        expect(bad.body.error.code).toMatch(/^422\.003\./);
        await me().patch(`/api/stories/${storyId}/lore-sets/${set.id}/entries/${entry.id + 1000}`).send({ name: 'x' }).expect(404);
        // A set's entry is not reachable as one of the Story's own.
        await me().patch(`/api/stories/${storyId}/lore/${entry.id}`).send({ name: 'x' }).expect(404);

        const renamed = await me().patch(`/api/stories/${storyId}/lore-sets/${set.id}`).send({ name: 'The Wrecking Coast' }).expect(200);
        expect((renamed.body as Story).loreSets[0].name).toBe('The Wrecking Coast');
        expect(await sets()).toEqual([{ id: set.id, name: 'The Wrecking Coast', entries: 1, stories: [{ id: storyId, title: 'The Lighthouse' }] }]);

        await me().post(`/api/stories/${storyId}/lore-sets/${set.id}/entries`).send({ name: 'Second' }).expect(201);
        const removed = await me().delete(entryPath).expect(200);
        expect((removed.body as Story).loreSets[0].entries.map((left) => left.name)).toEqual(['Second']);
        // A set without a name is listed as "Lore set".
        await me().patch(`/api/stories/${storyId}/lore-sets/${set.id}`).send({ name: '  ' }).expect(200);
        expect((await sets())[0].name).toBe('Lore set');
    });

    it('a set linked to two Stories is one set: a change through either reaches both, and unlinking keeps it for the other', async () => {
        const first = await createStory('First');
        const second = await createStory('Second');
        const set = ((await me().post(`/api/stories/${first}/lore-sets`).send({ name: 'Shared' }).expect(201)).body as Story).loreSets[0];
        await me().post(`/api/stories/${first}/lore-sets/${set.id}/entries`).send({ name: 'Reef', text: 'The reef eats ships.' }).expect(201);

        // Not linked yet: the second Story can't change it.
        await me().post(`/api/stories/${second}/lore-sets/${set.id}/entries`).send({ name: 'x' }).expect(404);
        await me().patch(`/api/stories/${second}/lore-sets/${set.id}`).send({ name: 'x' }).expect(404);

        // Named twice, linked once.
        const linked = await me().put(`/api/stories/${second}/lore-sets`).send({ loreSetIds: [set.id, set.id] }).expect(200);
        expect((linked.body as Story).loreSets).toMatchObject([{ id: set.id, name: 'Shared', usedBy: 2, entries: [{ name: 'Reef' }] }]);
        expect((await story(first)).loreSets[0].usedBy).toBe(2);

        const entryId = (linked.body as Story).loreSets[0].entries[0].id;
        await me().patch(`/api/stories/${second}/lore-sets/${set.id}/entries/${entryId}`).send({ text: 'The reef eats ships whole.' }).expect(200);
        expect((await story(first)).loreSets[0].entries[0].text).toBe('The reef eats ships whole.');
        expect((await sets()).find((listed) => listed.id === set.id)?.stories.map((linkedStory) => linkedStory.title)).toEqual(['First', 'Second']);

        // Unlinked from the first: gone there, whole for the second.
        const unlinked = await me().put(`/api/stories/${first}/lore-sets`).send({ loreSetIds: [] }).expect(200);
        expect((unlinked.body as Story).loreSets).toEqual([]);
        expect((await story(second)).loreSets).toMatchObject([{ id: set.id, usedBy: 1, entries: [{ text: 'The reef eats ships whole.' }] }]);

        // A copy of a Story links the same sets: they are shared, not copied.
        const copy = (await me().post(`/api/stories/${second}/duplicate`).send({}).expect(201)).body as Story;
        expect(copy.loreSets).toMatchObject([{ id: set.id, usedBy: 2 }]);
        // Deleting a Story unlinks it and leaves the set.
        await me().delete(`/api/stories/${copy.id}`).expect(204);
        expect((await story(second)).loreSets[0].usedBy).toBe(1);

        // Deleting the set takes it, and its entries, from every Story.
        await me().put(`/api/stories/${first}/lore-sets`).send({ loreSetIds: [set.id] }).expect(200);
        const deleted = await me().delete(`/api/stories/${first}/lore-sets/${set.id}`).expect(200);
        expect((deleted.body as Story).loreSets).toEqual([]);
        expect((await story(second)).loreSets).toEqual([]);
        expect((await sets()).some((listed) => listed.id === set.id)).toBe(false);
        await me().put(`/api/stories/${second}/lore-sets`).send({ loreSetIds: [set.id] }).expect(404);
    });

    it("moves a Story's own Lore into a new set, so what the Story reads is the same and another can link it", async () => {
        const storyId = await createStory('The Old One');
        await me().post(`/api/stories/${storyId}/lore`).send({ name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.' }).expect(201);
        const before = (await me().post(`/api/stories/${storyId}/lore`).send({ name: 'Salt', text: 'Salt is money here.', alwaysOn: true }).expect(201)).body as Story;

        const moved = (await me().post(`/api/stories/${storyId}/lore-sets`).send({ name: 'The Steppe', moveLore: true }).expect(201)).body as Story;
        expect(moved.lore).toEqual([]);
        // The same entries, by id, in the same order.
        expect(moved.loreSets).toEqual([{ id: moved.loreSets[0].id, name: 'The Steppe', usedBy: 1, entries: before.lore }]);

        // New own entries can be written beside it, and a second move adds to another set without disturbing the first.
        await me().post(`/api/stories/${storyId}/lore`).send({ name: 'Own again', text: 'Only here.' }).expect(201);
        const again = (await me().post(`/api/stories/${storyId}/lore-sets`).send({ moveLore: true }).expect(201)).body as Story;
        expect(again.lore).toEqual([]);
        expect(again.loreSets.map((set) => set.entries.map((entry) => entry.name))).toEqual([['Tents', 'Salt'], ['Own again']]);
    });

    it('links at most five sets, and only sets of the same Account', async () => {
        const storyId = await createStory('Crowded');
        for (let n = 1; n <= 5; n++) await me().post(`/api/stories/${storyId}/lore-sets`).send({ name: `Set ${n}` }).expect(201);
        const full = await me().post(`/api/stories/${storyId}/lore-sets`).send({ name: 'Set 6' }).expect(422);
        expect(full.body.error).toMatchObject({ code: '422.003.031', message: 'A Story can link at most 5 Lore sets.' });
        const linked = (await story(storyId)).loreSets.map((set) => set.id);

        const other = await createStory('Another');
        const extra = ((await me().post(`/api/stories/${other}/lore-sets`).send({ name: 'Extra' }).expect(201)).body as Story).loreSets[0].id;
        await me().put(`/api/stories/${storyId}/lore-sets`).send({ loreSetIds: [...linked, extra] }).expect(422);
        // The order given is the order kept.
        const reordered = await me().put(`/api/stories/${storyId}/lore-sets`).send({ loreSetIds: [...linked].reverse() }).expect(200);
        expect((reordered.body as Story).loreSets.map((set) => set.name)).toEqual(['Set 5', 'Set 4', 'Set 3', 'Set 2', 'Set 1']);

        // Another Account's set is not there to link, to list or to change.
        const theirs = await createStory('Theirs', member);
        const theirSet = ((await as(member).post(`/api/stories/${theirs}/lore-sets`).send({ name: 'Private' }).expect(201)).body as Story).loreSets[0].id;
        const missing = await me().put(`/api/stories/${other}/lore-sets`).send({ loreSetIds: [theirSet] }).expect(404);
        expect(missing.body.error.code).toBe('404.003.030');
        expect((await sets()).some((listed) => listed.id === theirSet)).toBe(false);
        expect((await sets(member)).map((listed) => listed.name)).toEqual(['Private']);
        await me().put(`/api/stories/${other}/lore-sets`).send({ loreSetIds: [999_999] }).expect(404);
        await me().put(`/api/stories/${other}/lore-sets`).send({ loreSetIds: ['x'] }).expect(400);
    });

    it("a Chat's prompts carry a linked set's entries like the Story's own: when they come up, always, in Lore in play, and no more once unlinked", async () => {
        const world = await createStory('World keeper');
        const set = ((await me().post(`/api/stories/${world}/lore-sets`).send({ name: 'The Salt Coast' }).expect(201)).body as Story).loreSets[0];
        await me().post(`/api/stories/${world}/lore-sets/${set.id}/entries`).send({ name: 'Wreckers', keywords: ['false light'], text: 'They lure ships with false lights.' }).expect(201);
        await me().post(`/api/stories/${world}/lore-sets/${set.id}/entries`).send({ name: 'Sky law', text: 'Never point at the moon.', alwaysOn: true }).expect(201);

        const storyId = await createStory('The Lighthouse');
        await me().post(`/api/stories/${storyId}/lore`).send({ name: 'Lamp oil', keywords: ['oil'], text: 'Whale oil, rationed.' }).expect(201);
        await me().put(`/api/stories/${storyId}/lore-sets`).send({ loreSetIds: [set.id] }).expect(200);
        const chatId = (await me().post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;

        // Nothing came up: only the set's always-on entry is sent.
        const quiet = await send(storyId, chatId, 'I climb the stair.');
        expect(quiet).toContain('# Lore');
        expect(quiet).toContain('Never point at the moon.');
        expect(quiet).not.toContain('false lights');
        expect(quiet).not.toContain('Whale oil');

        // Both come up: the Story's own entry and the set's, each by its keyword.
        const both = await send(storyId, chatId, 'I check the oil and watch for a false light.');
        expect(both).toContain('Whale oil, rationed.');
        expect(both).toContain('They lure ships with false lights.');
        expect(both).toContain('Never point at the moon.');

        const inPlay = (await me().get(`/api/stories/${storyId}/chats/${chatId}/lore`).expect(200)).body as { entries: Array<{ name: string }> };
        expect(inPlay.entries.map((entry) => entry.name).sort()).toEqual(['Lamp oil', 'Sky law', 'Wreckers']);

        // An edit made through the other Story is what this Chat reads next.
        const wreckers = (await story(world)).loreSets[0].entries.find((entry) => entry.name === 'Wreckers')!;
        await me().patch(`/api/stories/${world}/lore-sets/${set.id}/entries/${wreckers.id}`).send({ text: 'They hang lanterns on the cliff.' }).expect(200);
        const edited = await send(storyId, chatId, 'Is that a false light?');
        expect(edited).toContain('They hang lanterns on the cliff.');
        expect(edited).not.toContain('false lights.');

        // Unlinked: the Chat reads only the Story's own Lore again.
        await me().put(`/api/stories/${storyId}/lore-sets`).send({ loreSetIds: [] }).expect(200);
        const alone = await send(storyId, chatId, 'I check the oil and watch for a false light.');
        expect(alone).toContain('Whale oil, rationed.');
        expect(alone).not.toContain('lanterns on the cliff');
        expect(alone).not.toContain('Never point at the moon.');
    });

    it("a Character card written from a Story carries its linked sets' entries, so the card stands alone", async () => {
        const storyId = await createStory('Carded');
        await me().post(`/api/stories/${storyId}/lore`).send({ name: 'Own', text: 'Only this Story.' }).expect(201);
        const set = ((await me().post(`/api/stories/${storyId}/lore-sets`).send({ name: 'Shared' }).expect(201)).body as Story).loreSets[0];
        await me().post(`/api/stories/${storyId}/lore-sets/${set.id}/entries`).send({ name: 'Reef', text: 'The reef eats ships.' }).expect(201);
        await me().post(`/api/stories/${storyId}/lore-sets/${set.id}/entries`).send({ name: 'Blank' }).expect(201);

        const read = (await me().get(`/api/stories/${storyId}`).expect(200)).body;
        const card = writeCard(read, read.characters[0]);
        const book = (card.v2 as { data: { character_book?: { entries: Array<{ content: string }> } } }).data.character_book;
        expect(book?.entries.map((entry) => entry.content)).toEqual(['Only this Story.', 'The reef eats ships.']);
    });
});

import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { recordedFetch } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface Story {
    id: number;
    title: string;
    setting: string;
    opening: string;
    style: { pov: string; tense: string; replyLength: string; imageStyle: string };
    role: { id: number; name: string; description: string };
    characters: Array<{
        id: number;
        name: string;
        appearance: string;
        personality: string;
        voice: string;
        exampleLines: string[];
        background: string;
        secrets: string;
        arcDirections: string;
    }>;
    startingBonds: Array<{
        id: number;
        fromCharacterId: number;
        toCharacterId: number | null;
        label: string;
        description: string;
    }>;
    scenes: Array<{ id: number; name: string; situation: string; moveOnCondition: string }>;
    playable: boolean;
    missing: Array<{ field: string; label: string }>;
    updatedAt: string;
}

interface AssistantResponse {
    story: Story;
    reply: string;
    changes: Array<{
        kind: 'set' | 'add' | 'remove';
        target: string;
        id?: number;
        field?: string;
        before?: string | string[];
        after?: string | string[];
        label: string;
    }>;
    pending: { changes: unknown[]; removals: string[] } | null;
}

const character = (name: string, extra: object = {}) => ({
    name,
    appearance: `${name} looks tired.`,
    personality: `${name} is kind.`,
    voice: `${name} mumbles.`,
    ...extra,
});

/** Everything but `updatedAt`, which every write bumps. */
const content = ({ updatedAt: _updatedAt, ...rest }: Story) => rest;

describe('Story assistant', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    /** A playable Story: Mira and Tomas, Mira wary of the Role, one Scene. */
    async function createStory(cast: object[] = [character('Mira', { secrets: 'Put the lamp out.' }), character('Tomas')]): Promise<Story> {
        const created = await t.http
            .post('/api/stories')
            .send({ title: 'The Lighthouse', setting: 'A lighthouse on a storm-cut island, 1890s.', opening: 'The lamp went out.' })
            .expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'The new keeper', description: 'Arrived this morning.' }).expect(200);
        for (const item of cast) {
            await t.http.post(`/api/stories/${storyId}/characters`).send(item).expect(201);
        }
        const { body: withCast } = await t.http.get(`/api/stories/${storyId}`).expect(200);
        if (withCast.characters.length > 0) {
            await t.http
                .post(`/api/stories/${storyId}/starting-bonds`)
                .send({ fromCharacterId: withCast.characters[0].id, toCharacterId: null, label: 'wary', description: 'Watches.' })
                .expect(201);
        }
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'Arrival', situation: 'Reach the lamp room.' }).expect(201);
        const { body } = await t.http.get(`/api/stories/${storyId}`).expect(200);
        return body as Story;
    }

    async function read(storyId: number): Promise<Story> {
        const { body } = await t.http.get(`/api/stories/${storyId}`).expect(200);
        return body as Story;
    }

    async function instruct(storyId: number, body: object, status = 200): Promise<AssistantResponse> {
        const response = await t.http.post(`/api/stories/${storyId}/assistant`).send(body).expect(status);
        return response.body as AssistantResponse;
    }

    function script(reply: string, changes: unknown[]) {
        t.gateway.scriptText('story_assistant', JSON.stringify({ reply, changes }));
    }

    describe('An instruction applies a change set', () => {
        it('updates only the named fields, answers them with their old values, and makes one stateless call', async () => {
            const before = await createStory();
            const [mira, tomas] = before.characters;
            script('Done: a drowned causeway, a drier Mira, first person.', [
                { op: 'set', target: 'story', field: 'setting', value: 'A lighthouse at the end of a drowned causeway, 1890s.' },
                { op: 'set', target: 'story', field: 'pov', value: 'first' },
                { op: 'set', target: 'role', field: 'name', value: 'The relief keeper' },
                { op: 'set', target: 'character', name: 'mira', field: 'voice', value: 'Clipped. Drops the subject when it hurts.' },
                { op: 'set', target: 'character', name: 'Mira', field: 'exampleLines', value: ['Go away.', ' ', 'Fine. Stay.'] },
                { op: 'set', target: 'scene', name: 'Arrival', field: 'situation', value: 'Climb the stairs before the storm turns.' },
                { op: 'set', target: 'startingBond', from: 'Mira', toward: 'role', field: 'label', value: 'suspicious' },
            ]);

            const result = await instruct(before.id, { instruction: 'Make the island feel more drowned, Mira drier, and tell it in first person.' });

            expect(result.reply).toBe('Done: a drowned causeway, a drier Mira, first person.');
            expect(result.pending).toBeNull();
            expect(content(result.story)).toEqual({
                ...content(before),
                setting: 'A lighthouse at the end of a drowned causeway, 1890s.',
                style: { ...before.style, pov: 'first' },
                role: { ...before.role, name: 'The relief keeper' },
                characters: [
                    { ...mira, voice: 'Clipped. Drops the subject when it hurts.', exampleLines: ['Go away.', 'Fine. Stay.'] },
                    tomas,
                ],
                startingBonds: [{ ...before.startingBonds[0], label: 'suspicious' }],
                scenes: [{ ...before.scenes[0], situation: 'Climb the stairs before the storm turns.' }],
            });
            expect(await read(before.id)).toEqual(result.story);

            expect(result.changes).toEqual([
                { kind: 'set', target: 'story', field: 'setting', before: before.setting, after: 'A lighthouse at the end of a drowned causeway, 1890s.', label: 'Setting' },
                { kind: 'set', target: 'story', field: 'pov', before: 'second', after: 'first', label: 'POV' },
                { kind: 'set', target: 'role', field: 'name', before: 'The new keeper', after: 'The relief keeper', label: 'Role: Name' },
                { kind: 'set', target: 'character', id: mira.id, field: 'voice', before: 'Mira mumbles.', after: 'Clipped. Drops the subject when it hurts.', label: 'Mira: Voice' },
                { kind: 'set', target: 'character', id: mira.id, field: 'exampleLines', before: [], after: ['Go away.', 'Fine. Stay.'], label: 'Mira: Example lines' },
                { kind: 'set', target: 'scene', id: before.scenes[0].id, field: 'situation', before: 'Reach the lamp room.', after: 'Climb the stairs before the storm turns.', label: 'Arrival: Situation' },
                { kind: 'set', target: 'startingBond', id: before.startingBonds[0].id, field: 'label', before: 'wary', after: 'suspicious', label: "Mira's starting Bond toward the Role: Label" },
            ]);

            const calls = t.gateway.textCalls();
            expect(calls).toHaveLength(1);
            expect(calls[0]).toMatchObject({ kind: 'story_assistant', json: true, servedFor: { storyId: before.id } });
            // Stateless: the Story and the one instruction, nothing earlier.
            expect(calls[0].messages.map((message) => message.role)).toEqual(['system', 'user']);
            const system = calls[0].messages[0].content;
            const user = calls[0].messages[1].content;
            expect(system).toContain('adult fiction between fictional adults');
            expect(system).toContain('"op": "set"');
            expect(user).toContain("The author's instruction:\nMake the island feel more drowned");
            expect(user).toContain(before.setting);
            expect(user).toContain('Put the lamp out.');
            expect(user).toContain('Arrival');
        });

        it('adds a Character with starting Bonds toward the Role and toward a Character, and adds a Scene', async () => {
            const before = await createStory();
            const [mira] = before.characters;
            script('Lena, her sister, joins; and a second Scene.', [
                { op: 'add', target: 'startingBond', value: { from: 'Lena', toward: 'Mira', label: 'protective', description: 'Older by a year.' } },
                { op: 'add', target: 'startingBond', value: { from: 'Mira', toward: 'Lena', label: 'resentful' } },
                {
                    op: 'add',
                    target: 'character',
                    value: {
                        name: 'Lena',
                        appearance: 'Mira without the scar.',
                        personality: 'Warm, loud, tired of secrets.',
                        voice: 'Talks over people.',
                        exampleLines: ['Mira. Sit down.'],
                        background: 'Left the island at sixteen.',
                    },
                },
                { op: 'add', target: 'startingBond', value: { from: 'Lena', toward: 'role', label: 'curious' } },
                { op: 'add', target: 'scene', value: { name: 'The lamp', situation: 'Light it before the ship rounds the point.' } },
            ]);

            const result = await instruct(before.id, { instruction: 'Give Mira a sister.' });

            const lena = result.story.characters[2];
            expect(lena).toMatchObject({
                name: 'Lena',
                appearance: 'Mira without the scar.',
                voice: 'Talks over people.',
                exampleLines: ['Mira. Sit down.'],
                background: 'Left the island at sixteen.',
                secrets: '',
            });
            expect(result.story.characters.slice(0, 2)).toEqual(before.characters);
            expect(result.story.startingBonds).toEqual([
                before.startingBonds[0],
                expect.objectContaining({ fromCharacterId: lena.id, toCharacterId: mira.id, label: 'protective', description: 'Older by a year.' }),
                expect.objectContaining({ fromCharacterId: mira.id, toCharacterId: lena.id, label: 'resentful' }),
                expect.objectContaining({ fromCharacterId: lena.id, toCharacterId: null, label: 'curious' }),
            ]);
            expect(result.story.scenes.map((scene) => scene.name)).toEqual(['Arrival', 'The lamp']);
            expect(result.story.playable).toBe(false); // Arrival now needs its move-on condition.
            expect(result.changes).toEqual([
                { kind: 'add', target: 'character', id: lena.id, label: 'Character Lena' },
                { kind: 'add', target: 'scene', id: result.story.scenes[1].id, label: 'Scene The lamp' },
                { kind: 'add', target: 'startingBond', id: result.story.startingBonds[1].id, label: "Lena's starting Bond toward Mira" },
                { kind: 'add', target: 'startingBond', id: result.story.startingBonds[2].id, label: "Mira's starting Bond toward Lena" },
                { kind: 'add', target: 'startingBond', id: result.story.startingBonds[3].id, label: "Lena's starting Bond toward the Role" },
            ]);
            expect(await read(before.id)).toEqual(result.story);
        });

        it('addresses an unnamed Character by its number, and reads a fenced answer', async () => {
            const before = await createStory([character('Mira'), { appearance: 'A shadow.', personality: 'Quiet.', voice: 'Whispers.' }]);
            t.gateway.scriptText(
                'story_assistant',
                '```json\n' +
                    JSON.stringify({
                        reply: 'Named.',
                        changes: [{ op: 'set', target: 'character', name: 'Character 2', field: 'name', value: 'Tomas' }],
                    }) +
                    '\n```',
            );

            const result = await instruct(before.id, { instruction: 'Name the second Character.' });

            expect(result.story.characters[1].name).toBe('Tomas');
            expect(result.changes).toEqual([
                { kind: 'set', target: 'character', id: before.characters[1].id, field: 'name', before: '', after: 'Tomas', label: 'Character 2: Name' },
            ]);
        });

        it('changes nothing when the answer has no changes, and still answers the reply', async () => {
            const before = await createStory();
            script('Mira is fine as she is: guarded, dry, and the lamp is her secret.', []);

            const result = await instruct(before.id, { instruction: 'Is Mira all right?' });

            expect(result.reply).toMatch(/Mira is fine/);
            expect(result.changes).toEqual([]);
            expect(result.pending).toBeNull();
            expect(await read(before.id)).toEqual(before);
        });

        it('works on a Story that already has Chats', async () => {
            const before = await createStory();
            await t.http.post(`/api/stories/${before.id}/chats`).expect(201);
            script('Changed.', [{ op: 'set', target: 'story', field: 'title', value: 'The Lamp Goes Dark' }]);

            const result = await instruct(before.id, { instruction: 'Better title.' });

            expect(result.story.title).toBe('The Lamp Goes Dark');
            expect((await read(before.id)).title).toBe('The Lamp Goes Dark');
        });
    });

    describe('The 6-Character limit', () => {
        it('refuses a 7th Character, with nothing saved, and allows one in when another goes', async () => {
            const before = await createStory(['A', 'B', 'C', 'D', 'E', 'F'].map((name) => character(name)));
            expect(before.characters).toHaveLength(6);
            script('Adding G.', [
                { op: 'set', target: 'story', field: 'title', value: 'Seven' },
                { op: 'add', target: 'character', value: character('G') },
            ]);

            const refused = await t.http.post(`/api/stories/${before.id}/assistant`).send({ instruction: 'Add G.' }).expect(422);

            expect(refused.body.error.code).toBe('422.003.005');
            expect(await read(before.id)).toEqual(before);

            script('F leaves, G arrives.', [
                { op: 'add', target: 'character', value: character('G') },
                { op: 'remove', target: 'character', name: 'F' },
            ]);
            const swapped = await instruct(before.id, { instruction: 'Replace F with G.', confirmRemovals: true });
            expect(swapped.story.characters.map((c) => c.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'G']);
            expect(swapped.changes).toEqual([
                { kind: 'remove', target: 'character', label: 'Character F' },
                { kind: 'add', target: 'character', id: swapped.story.characters[5].id, label: 'Character G' },
            ]);
        });
    });

    describe('A removal requires the confirmation flag', () => {
        it('answers the change set as pending, applies it only with the flag, and refuses apply without it', async () => {
            const before = await createStory();
            script('Tomas and the Arrival Scene are gone; the Setting mentions the brother who left.', [
                { op: 'set', target: 'story', field: 'setting', value: 'A lighthouse on a storm-cut island, 1890s. The brother left last winter.' },
                { op: 'remove', target: 'character', name: 'Tomas' },
                { op: 'remove', target: 'scene', name: 'Arrival' },
            ]);

            const pending = await instruct(before.id, { instruction: 'Remove Tomas and the first Scene.' });

            expect(pending.changes).toEqual([]);
            expect(pending.story).toEqual(before);
            // The validated set names Characters and Scenes by id, in the model's order.
            expect(pending.pending).toEqual({
                removals: ['Character Tomas', 'Scene Arrival'],
                changes: [
                    { op: 'set', target: 'story', field: 'setting', value: 'A lighthouse on a storm-cut island, 1890s. The brother left last winter.' },
                    { op: 'remove', target: 'character', id: before.characters[1].id },
                    { op: 'remove', target: 'scene', id: before.scenes[0].id },
                ],
            });
            expect(await read(before.id)).toEqual(before);

            const refused = await t.http
                .post(`/api/stories/${before.id}/assistant/apply`)
                .send({ changes: pending.pending!.changes })
                .expect(409);
            expect(refused.body.error.code).toBe('409.005.008');
            expect(refused.body.error.message).toContain('Character Tomas');
            expect(await read(before.id)).toEqual(before);

            const applied = (
                await t.http
                    .post(`/api/stories/${before.id}/assistant/apply`)
                    .send({ changes: pending.pending!.changes, confirmRemovals: true })
                    .expect(200)
            ).body as AssistantResponse;
            expect(applied.pending).toBeNull();
            expect(applied.story.characters.map((c) => c.name)).toEqual(['Mira']);
            expect(applied.story.scenes).toEqual([]);
            expect(applied.story.setting).toMatch(/brother left/);
            expect(applied.story.startingBonds).toEqual(before.startingBonds);
            expect(applied.changes).toEqual([
                { kind: 'remove', target: 'character', label: 'Character Tomas' },
                { kind: 'remove', target: 'scene', label: 'Scene Arrival' },
                expect.objectContaining({ kind: 'set', target: 'story', field: 'setting', before: before.setting }),
            ]);
            expect(await read(before.id)).toEqual(applied.story);
            // Confirming is not another model call.
            expect(t.gateway.textCalls()).toHaveLength(1);
        });

        it('applies removals straight away when the instruction call carries the flag, and takes a Character\'s Bonds with it', async () => {
            const before = await createStory();
            script('Mira is gone.', [{ op: 'remove', target: 'character', name: 'Mira' }]);

            const result = await instruct(before.id, { instruction: 'Remove Mira.', confirmRemovals: true });

            expect(result.pending).toBeNull();
            expect(result.story.characters.map((c) => c.name)).toEqual(['Tomas']);
            expect(result.story.startingBonds).toEqual([]);
            expect(result.changes).toEqual([{ kind: 'remove', target: 'character', label: 'Character Mira' }]);
        });

        it('removing a starting Bond needs no confirmation', async () => {
            const before = await createStory();
            script('Mira no longer starts wary.', [{ op: 'remove', target: 'startingBond', from: 'Mira', toward: 'role' }]);

            const result = await instruct(before.id, { instruction: 'Drop the wary Bond.' });

            expect(result.pending).toBeNull();
            expect(result.story.startingBonds).toEqual([]);
            expect(result.changes).toEqual([{ kind: 'remove', target: 'startingBond', label: "Mira's starting Bond toward the Role" }]);
        });
    });

    describe('An unusable answer saves nothing and answers a typed error', () => {
        async function expectRejected(reply: string, status: number, code: string): Promise<string> {
            const before = await createStory();
            t.gateway.scriptText('story_assistant', reply);

            const response = await t.http.post(`/api/stories/${before.id}/assistant`).send({ instruction: 'Change things.' }).expect(status);

            expect(response.body.error.code).toBe(code);
            expect(await read(before.id)).toEqual(before);
            return response.body.error.message as string;
        }

        const invalid = (changes: unknown[]) => JSON.stringify({ reply: 'Done.', changes });

        it('a Character not in the cast', async () => {
            const message = await expectRejected(
                invalid([{ op: 'set', target: 'character', name: 'Nobody', field: 'voice', value: 'Hm.' }]),
                502,
                '502.005.006',
            );
            expect(message).toMatch(/"Nobody", who is not a Character/);
        });

        it('a field that does not exist, and a Style value outside its set', async () => {
            await expectRejected(invalid([{ op: 'set', target: 'character', name: 'Mira', field: 'mood', value: 'sad' }]), 502, '502.005.006');
            const message = await expectRejected(invalid([{ op: 'set', target: 'story', field: 'pov', value: 'fourth' }]), 502, '502.005.006');
            expect(message).toMatch(/pov/);
        });

        it('a new Character without a voice, a Bond toward itself, and two Bonds in one direction', async () => {
            await expectRejected(invalid([{ op: 'add', target: 'character', value: { ...character('Lena'), voice: ' ' } }]), 502, '502.005.006');
            await expectRejected(invalid([{ op: 'add', target: 'startingBond', value: { from: 'Mira', toward: 'Mira', label: 'proud' } }]), 502, '502.005.006');
            await expectRejected(invalid([{ op: 'add', target: 'startingBond', value: { from: 'Mira', toward: 'role', label: 'again' } }]), 502, '502.005.006');
        });

        it('an invalid set is rejected whole, even when its first changes were fine', async () => {
            await expectRejected(
                invalid([
                    { op: 'set', target: 'story', field: 'title', value: 'Changed' },
                    { op: 'remove', target: 'scene', name: 'Departure' },
                ]),
                502,
                '502.005.006',
            );
        });

        it('unparseable output', async () => {
            await expectRejected('Sure! Mira should probably have a sister...', 502, '502.005.005');
            await expectRejected('{"reply": "oops", "changes": [', 502, '502.005.005');
        });

        it('a client change set that no longer fits the Story is the client\'s error', async () => {
            const before = await createStory();
            const response = await t.http
                .post(`/api/stories/${before.id}/assistant/apply`)
                .send({ changes: [{ op: 'set', target: 'character', id: 999999, field: 'voice', value: 'Hm.' }] })
                .expect(422);
            expect(response.body.error.code).toBe('422.005.007');
            expect(await read(before.id)).toEqual(before);
            expect(t.gateway.textCalls()).toEqual([]);
        });
    });

    it('rejects a blank instruction, and an unknown Story, without calling the model', async () => {
        const before = await createStory();

        const blank = await t.http.post(`/api/stories/${before.id}/assistant`).send({ instruction: '   ' }).expect(422);
        expect(blank.body.error.code).toBe('422.005.009');

        const noStory = await t.http.post('/api/stories/999999/assistant').send({ instruction: 'Hi.' }).expect(404);
        expect(noStory.body.error.code).toBe('404.003.001');

        expect(t.gateway.textCalls()).toEqual([]);
        expect(await read(before.id)).toEqual(before);
    });

    it('passes a gateway outage through unchanged, saves nothing and switches no model', async () => {
        const before = await createStory();
        t.gateway.scriptText('story_assistant', new ProviderOutageError('OpenRouter: DeepInfra is down.'));

        const response = await t.http.post(`/api/stories/${before.id}/assistant`).send({ instruction: 'Anything.' }).expect(502);

        expect(response.body.error).toEqual({ code: '502.001.001', message: 'OpenRouter: DeepInfra is down.' });
        expect(await read(before.id)).toEqual(before);
        expect(t.gateway.calls).toHaveLength(1);
        expect(t.gateway.pendingReplies()).toEqual({});
    });
});

describe('Story assistant through the real gateway', () => {
    let t: TestApp;
    let net: ReturnType<typeof recordedFetch>;

    beforeAll(async () => {
        net = recordedFetch([{ fixture: 'openrouter/chat-story-assistant.json' }]);
        t = await startTestApp({ modelGateway: 'real', fetch: net.fetch, providerKeys: TEST_KEYS });
    });

    afterAll(async () => {
        await t.close();
    });

    it('writes one story_assistant UsageRecord against the Story, from a JSON-mode call', async () => {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.post(`/api/stories/${storyId}/characters`).send(character('Mira')).expect(201);

        const result = (await t.http.post(`/api/stories/${storyId}/assistant`).send({ instruction: 'Make Mira terser.' }).expect(200))
            .body as AssistantResponse;
        expect(result.story.characters[0].voice).toBe('Clipped half-sentences. Drops the subject when it hurts.');
        expect(net.requests[0].body.response_format).toEqual({ type: 'json_object' });

        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            const { rows } = await client.query('SELECT kind, pool, model, story_id, cost_usd::float8 AS cost_usd FROM usage_record ORDER BY id');
            expect(rows).toEqual([{ kind: 'story_assistant', pool: 'text', model: 'glm-5.3', story_id: storyId, cost_usd: 0.000456 }]);
        } finally {
            await client.end();
        }
    });
});

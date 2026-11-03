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

/** A draft with every required field and nothing optional. */
const minimalDraft = {
    title: 'The Lighthouse',
    setting: 'A lighthouse on a storm-cut island, 1890s.',
    opening: 'The lamp went out an hour ago.',
    style: { pov: 'first', tense: 'present', replyLength: 'short' },
    role: { name: 'The new keeper', description: 'Arrived this morning, knows nothing of the island.' },
    characters: [
        {
            name: 'Mira',
            appearance: 'Tall, grey eyes, a scar across one eyebrow.',
            personality: 'Guarded and dry, warms slowly.',
            voice: 'Short sentences. Never says please.',
        },
    ],
};

const character = (name: string, extra: object = {}) => ({
    name,
    appearance: `${name} looks tired.`,
    personality: `${name} is kind.`,
    voice: `${name} mumbles.`,
    ...extra,
});

describe('Story drafting', () => {
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

    async function listIds(): Promise<number[]> {
        const list = await t.http.get('/api/stories').expect(200);
        return (list.body.stories as Story[]).map((story) => story.id);
    }

    async function draft(idea = 'A lighthouse keeper and the woman who put the lamp out.'): Promise<Story> {
        const response = await t.http.post('/api/stories/draft').send({ idea }).expect(201);
        return response.body as Story;
    }

    describe('Draft from idea', () => {
        it('saves a valid draft as a playable Story, served for that Story', async () => {
            t.gateway.scriptText('story_draft', JSON.stringify(minimalDraft));

            const story = await draft();

            expect(story).toMatchObject({
                title: 'The Lighthouse',
                setting: minimalDraft.setting,
                opening: minimalDraft.opening,
                style: { pov: 'first', tense: 'present', replyLength: 'short', imageStyle: '' },
                role: { name: 'The new keeper', description: minimalDraft.role.description },
                playable: true,
                missing: [],
            });
            expect(story.characters).toHaveLength(1);
            expect(story.characters[0]).toMatchObject(minimalDraft.characters[0]);

            const read = await t.http.get(`/api/stories/${story.id}`).expect(200);
            expect(read.body).toEqual(story);
            expect(await listIds()).toContain(story.id);

            const calls = t.gateway.textCalls();
            expect(calls).toHaveLength(1);
            expect(calls[0]).toMatchObject({
                kind: 'story_draft',
                json: true,
                servedFor: { storyId: story.id },
            });
        });

        it('sends the idea, says the Story is adult fiction between fictional adults, and uses the glossary', async () => {
            t.gateway.scriptText('story_draft', JSON.stringify(minimalDraft));

            await draft('ไอเดีย: ผู้ดูแลประภาคารกับหญิงสาวลึกลับ');

            const [call] = t.gateway.textCalls('story_draft');
            const system = call.messages.find((message) => message.role === 'system')!.content;
            const user = call.messages.find((message) => message.role === 'user')!.content;
            expect(user).toContain('ผู้ดูแลประภาคารกับหญิงสาวลึกลับ');
            expect(system).toContain('adult fiction between fictional adults');
            for (const word of ['Story', 'Setting', 'Opening', 'Style', 'Role', 'Character', 'Scene', 'StartingBond']) {
                expect(system).toContain(word);
            }
        });

        it('leaves optional fields empty when the draft has none', async () => {
            t.gateway.scriptText('story_draft', JSON.stringify(minimalDraft));

            const story = await draft();

            expect(story.style.imageStyle).toBe('');
            expect(story.characters[0]).toMatchObject({
                exampleLines: [],
                background: '',
                secrets: '',
                arcDirections: '',
            });
            expect(story.startingBonds).toEqual([]);
            expect(story.scenes).toEqual([]);
        });

        it('saves optional fields, StartingBonds by Character name and Scenes in order when the draft has them', async () => {
            t.gateway.scriptText(
                'story_draft',
                JSON.stringify({
                    ...minimalDraft,
                    style: { ...minimalDraft.style, imageStyle: 'ink wash, muted' },
                    characters: [
                        character('Mira', {
                            exampleLines: ['Go away.', ' ', 'Fine. Stay.'],
                            background: 'Born on the island.',
                            secrets: 'She put the lamp out herself.',
                            arcDirections: 'If trusted, her coldness thaws.',
                        }),
                        character('Tomas'),
                    ],
                    startingBonds: [
                        { from: 'Mira', toward: 'role', label: 'wary', description: 'Watches every move.' },
                        { from: 'mira', toward: 'Tomas', label: 'protective' },
                        { from: 'Tomas', toward: null, label: 'eager' },
                    ],
                    scenes: [
                        { name: 'Arrival', situation: 'Reach the lamp room.', moveOnCondition: 'Mira lets you up.' },
                        { name: 'The lamp', situation: 'Light it.' },
                    ],
                }),
            );

            const story = await draft();

            expect(story.style.imageStyle).toBe('ink wash, muted');
            const [mira, tomas] = story.characters;
            expect(mira).toMatchObject({
                name: 'Mira',
                exampleLines: ['Go away.', 'Fine. Stay.'],
                background: 'Born on the island.',
                secrets: 'She put the lamp out herself.',
                arcDirections: 'If trusted, her coldness thaws.',
            });
            expect(tomas.name).toBe('Tomas');
            expect(story.startingBonds).toEqual([
                expect.objectContaining({ fromCharacterId: mira.id, toCharacterId: null, label: 'wary', description: 'Watches every move.' }),
                expect.objectContaining({ fromCharacterId: mira.id, toCharacterId: tomas.id, label: 'protective', description: '' }),
                expect.objectContaining({ fromCharacterId: tomas.id, toCharacterId: null, label: 'eager' }),
            ]);
            expect(story.scenes.map((scene) => [scene.name, scene.moveOnCondition])).toEqual([
                ['Arrival', 'Mira lets you up.'],
                ['The lamp', ''],
            ]);
            expect(story.playable).toBe(true);
        });

        it('reads a draft wrapped in a code fence', async () => {
            t.gateway.scriptText('story_draft', '```json\n' + JSON.stringify(minimalDraft) + '\n```');

            const story = await draft();
            expect(story.title).toBe('The Lighthouse');
        });

        describe('an invalid draft is not saved and answers a typed error', () => {
            async function expectRejected(reply: string, status: number, code: string): Promise<string> {
                const before = await listIds();
                t.gateway.scriptText('story_draft', reply);

                const response = await t.http.post('/api/stories/draft').send({ idea: 'An idea.' }).expect(status);

                expect(response.body.error.code).toBe(code);
                expect(await listIds()).toEqual(before);
                return response.body.error.message as string;
            }

            it('0 Characters', async () => {
                const message = await expectRejected(
                    JSON.stringify({ ...minimalDraft, characters: [] }),
                    502,
                    '502.005.002',
                );
                expect(message).toMatch(/1 to 6 Characters/);
            });

            it('7 Characters', async () => {
                await expectRejected(
                    JSON.stringify({
                        ...minimalDraft,
                        characters: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name) => character(name)),
                    }),
                    502,
                    '502.005.002',
                );
            });

            it('a Style value outside its set', async () => {
                const message = await expectRejected(
                    JSON.stringify({ ...minimalDraft, style: { ...minimalDraft.style, pov: 'fourth' } }),
                    502,
                    '502.005.002',
                );
                expect(message).toMatch(/pov/);
            });

            it('a required field missing', async () => {
                const message = await expectRejected(
                    JSON.stringify({ ...minimalDraft, characters: [{ ...character('Mira'), voice: '  ' }] }),
                    502,
                    '502.005.002',
                );
                expect(message).toMatch(/Mira needs a voice/);
            });

            it('a StartingBond toward a Character not in the cast, or a Character toward itself', async () => {
                await expectRejected(
                    JSON.stringify({
                        ...minimalDraft,
                        startingBonds: [{ from: 'Mira', toward: 'Nobody', label: 'wary' }],
                    }),
                    502,
                    '502.005.002',
                );
                await expectRejected(
                    JSON.stringify({
                        ...minimalDraft,
                        startingBonds: [{ from: 'Mira', toward: 'Mira', label: 'proud' }],
                    }),
                    502,
                    '502.005.002',
                );
            });

            it('unparseable output', async () => {
                await expectRejected('Sure! Here is a story about a lighthouse...', 502, '502.005.001');
                await expectRejected('{"title": "The Lighthouse", "characters": [', 502, '502.005.001');
            });
        });

        it('rejects a blank idea without calling the model', async () => {
            const before = await listIds();

            const response = await t.http.post('/api/stories/draft').send({ idea: '   ' }).expect(422);

            expect(response.body.error.code).toBe('422.005.003');
            expect(t.gateway.textCalls()).toEqual([]);
            expect(await listIds()).toEqual(before);
        });

        it('passes a gateway outage through unchanged, saves nothing and switches no model', async () => {
            const before = await listIds();
            t.gateway.scriptText('story_draft', new ProviderOutageError('OpenRouter: DeepInfra is down.'));

            const response = await t.http.post('/api/stories/draft').send({ idea: 'An idea.' }).expect(502);

            expect(response.body.error).toEqual({
                code: '502.001.001',
                message: 'OpenRouter: DeepInfra is down.',
            });
            expect(await listIds()).toEqual(before);
            // One call of the one kind, and nothing left scripted: no retry on another model.
            expect(t.gateway.calls).toHaveLength(1);
            expect(t.gateway.textCalls().map((call) => call.kind)).toEqual(['story_draft']);
            expect(t.gateway.pendingReplies()).toEqual({});
        });
    });

    describe('Rewrite this field', () => {
        async function draftedStory(): Promise<Story> {
            t.gateway.scriptText(
                'story_draft',
                JSON.stringify({
                    ...minimalDraft,
                    characters: [character('Mira', { secrets: 'Put the lamp out.' }), character('Tomas')],
                    startingBonds: [{ from: 'Mira', toward: 'role', label: 'wary', description: 'Watches.' }],
                    scenes: [{ name: 'Arrival', situation: 'Reach the lamp room.' }],
                }),
            );
            return draft();
        }

        async function rewrite(storyId: number, body: object): Promise<Story> {
            const response = await t.http.post(`/api/stories/${storyId}/rewrite`).send(body).expect(200);
            return response.body as Story;
        }

        /** Everything but `updatedAt`, which every write bumps. */
        const content = ({ updatedAt: _updatedAt, ...rest }: Story) => rest;

        it("changes only the Story's Setting, with the whole Story as context", async () => {
            const before = await draftedStory();
            t.gateway.scriptText('field_rewrite', 'A lighthouse at the end of a drowned causeway, 1890s.');

            const after = rewrite(before.id, { target: 'story', field: 'setting' });

            expect(content(await after)).toEqual({
                ...content(before),
                setting: 'A lighthouse at the end of a drowned causeway, 1890s.',
            });
            const [call] = t.gateway.textCalls('field_rewrite');
            expect(call).toMatchObject({ kind: 'field_rewrite', servedFor: { storyId: before.id } });
            expect(call.json).toBeFalsy();
            const user = call.messages.find((message) => message.role === 'user')!.content;
            expect(user).toContain("Rewrite this field: the Story's Setting");
            expect(user).toContain(minimalDraft.setting);
            expect(user).toContain('Mira');
            expect(user).toContain('Put the lamp out.');
            expect(user).toContain('Arrival');
            const system = call.messages.find((message) => message.role === 'system')!.content;
            expect(system).toContain('adult fiction between fictional adults');
        });

        it("changes only a Character's Voice, a Scene's situation, a Bond's label, the Role's name and the Image style", async () => {
            const before = await draftedStory();
            const [mira] = before.characters;
            t.gateway.scriptText(
                'field_rewrite',
                '"Clipped. Drops the subject when it hurts."',
                'Climb the stairs before the storm turns.',
                'suspicious',
                'The relief keeper',
                'ink wash, muted',
            );

            const afterVoice = await rewrite(before.id, { target: 'character', id: mira.id, field: 'voice' });
            expect(content(afterVoice)).toEqual({
                ...content(before),
                characters: [{ ...mira, voice: 'Clipped. Drops the subject when it hurts.' }, before.characters[1]],
            });

            const afterScene = await rewrite(before.id, { target: 'scene', id: before.scenes[0].id, field: 'situation' });
            expect(content(afterScene)).toEqual({
                ...content(afterVoice),
                scenes: [{ ...before.scenes[0], situation: 'Climb the stairs before the storm turns.' }],
            });

            const afterBond = await rewrite(before.id, {
                target: 'startingBond',
                id: before.startingBonds[0].id,
                field: 'label',
            });
            expect(content(afterBond)).toEqual({
                ...content(afterScene),
                startingBonds: [{ ...before.startingBonds[0], label: 'suspicious' }],
            });

            const afterRole = await rewrite(before.id, { target: 'role', field: 'name' });
            expect(content(afterRole)).toEqual({
                ...content(afterBond),
                role: { ...before.role, name: 'The relief keeper' },
            });

            const afterStyle = await rewrite(before.id, { target: 'story', field: 'imageStyle' });
            expect(content(afterStyle)).toEqual({
                ...content(afterRole),
                style: { ...before.style, imageStyle: 'ink wash, muted' },
            });

            const labels = t.gateway
                .textCalls('field_rewrite')
                .map((call) => /Rewrite this field: (.*)\./.exec(call.messages[1].content)?.[1]);
            expect(labels).toEqual([
                "Character Mira's Voice",
                "Scene Arrival's Situation",
                "the Label of Mira's starting Bond toward the Role",
                "the Role's Name",
                "the Story's Image style",
            ]);
        });

        it('refuses a field that is not a text field, and an unknown Character, without calling the model', async () => {
            const story = await draftedStory();

            const style = await t.http
                .post(`/api/stories/${story.id}/rewrite`)
                .send({ target: 'story', field: 'pov' })
                .expect(422);
            expect(style.body.error.code).toBe('422.005.004');

            const unknown = await t.http
                .post(`/api/stories/${story.id}/rewrite`)
                .send({ target: 'character', id: 999999, field: 'voice' })
                .expect(404);
            expect(unknown.body.error.code).toBe('404.003.002');

            const noStory = await t.http
                .post('/api/stories/999999/rewrite')
                .send({ target: 'story', field: 'title' })
                .expect(404);
            expect(noStory.body.error.code).toBe('404.003.001');

            expect(t.gateway.textCalls('field_rewrite')).toEqual([]);
        });

        it('keeps the field when the model writes nothing, or the provider is down', async () => {
            const before = await draftedStory();
            t.gateway.scriptText('field_rewrite', '   ', new ProviderOutageError());

            const empty = await t.http
                .post(`/api/stories/${before.id}/rewrite`)
                .send({ target: 'story', field: 'opening' })
                .expect(502);
            expect(empty.body.error.code).toBe('502.005.001');

            const outage = await t.http
                .post(`/api/stories/${before.id}/rewrite`)
                .send({ target: 'story', field: 'opening' })
                .expect(502);
            expect(outage.body.error.code).toBe('502.001.001');

            const read = await t.http.get(`/api/stories/${before.id}`).expect(200);
            expect(read.body).toEqual(before);
        });
    });
});

describe('Story drafting through the real gateway', () => {
    let t: TestApp;
    let net: ReturnType<typeof recordedFetch>;

    beforeAll(async () => {
        net = recordedFetch([{ fixture: 'openrouter/chat-story-draft.json' }, { fixture: 'openrouter/chat-success.json' }]);
        t = await startTestApp({ modelGateway: 'real', fetch: net.fetch, providerKeys: TEST_KEYS });
    });

    afterAll(async () => {
        await t.close();
    });

    it('writes a UsageRecord for the draft and for the rewrite, both against the Story', async () => {
        const drafted = (await t.http.post('/api/stories/draft').send({ idea: 'A lighthouse.' }).expect(201))
            .body as Story;
        expect(drafted.playable).toBe(true);

        const rewritten = (
            await t.http.post(`/api/stories/${drafted.id}/rewrite`).send({ target: 'story', field: 'opening' }).expect(200)
        ).body as Story;
        expect(rewritten.opening).toBe('The lighthouse keeper nods once and goes back to polishing the lens.');

        expect(net.requests.map((request) => request.body.response_format)).toEqual([{ type: 'json_object' }, undefined]);

        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            const { rows } = await client.query(
                'SELECT kind, pool, model, story_id, cost_usd::float8 AS cost_usd FROM usage_record ORDER BY id',
            );
            expect(rows).toEqual([
                { kind: 'story_draft', pool: 'text', model: 'glm-5.3', story_id: drafted.id, cost_usd: 0.000321 },
                { kind: 'field_rewrite', pool: 'text', model: 'glm-5.3', story_id: drafted.id, cost_usd: 0.000987 },
            ]);
        } finally {
            await client.end();
        }
    });
});

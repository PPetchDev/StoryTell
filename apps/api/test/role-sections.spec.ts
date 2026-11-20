import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { PROMPT_LAYERS } from '../src/manager/chat/turn/prompt.js';
import { fitHeading, MAX_ROLE_SECTIONS, roleSectionsProblem, roleText, tidyRoleSections } from '../src/manager/story/role-sections.js';
import { readChunks, readText } from '../src/manager/character-card/card-png.js';
import { pngImage } from './harness/card-files.js';
import { layersOf } from './harness/prompt-layers.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * .scratch/role-sections/spec.md: the Role's own sections save as one ordered list and validate;
 * they reach the Narrator after the Description, placeholders filled; Duplicate and a Character
 * card carry them; a Role without sections reads exactly as before. Everyone is an adult.
 */

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const SECTIONS = [
    { heading: 'Appearance', text: 'Silver hair, nine black-tipped tails.' },
    { heading: 'Powers', text: 'Reads a fight before it happens. Never kills.' },
];

describe('Role sections (pure)', () => {
    it('tidies ends, keeps order and repeats, and says what breaks a rule', () => {
        expect(tidyRoleSections([{ heading: '  Powers ', text: '\n Fast. \n' }])).toEqual([{ heading: 'Powers', text: 'Fast.' }]);
        expect(roleSectionsProblem([...SECTIONS, SECTIONS[0], { heading: 'Empty', text: '' }])).toBeNull();
        expect(roleSectionsProblem([{ heading: '', text: 'No heading is fine.' }])).toBeNull();
        // Counted in whole characters: 60 emoji fit, and fitting never splits one in half.
        expect(roleSectionsProblem([{ heading: '🦊'.repeat(60), text: '' }])).toBeNull();
        expect(fitHeading('a'.repeat(59) + '🦊🦊')).toBe('a'.repeat(59) + '🦊');
        expect(fitHeading(' Two\n lines ')).toBe('Two lines');
        expect(roleSectionsProblem([{ heading: 'Two\nlines', text: '' }])).toMatch(/one line/);
        expect(roleSectionsProblem([{ heading: 'h'.repeat(61), text: '' }])).toMatch(/60/);
        expect(roleSectionsProblem([{ heading: 'Long', text: 'x'.repeat(20001) }])).toMatch(/20000/);
        expect(roleSectionsProblem(Array.from({ length: MAX_ROLE_SECTIONS + 1 }, () => ({ heading: 'H', text: '' })))).toMatch(/at most 20/);
    });

    it('reads the Description, then each section with text as "Heading: text"; none changes nothing', () => {
        expect(roleText('The keeper.', [])).toBe('The keeper.');
        expect(roleText('The keeper.', undefined)).toBe('The keeper.');
        expect(roleText('The keeper.', [...SECTIONS, { heading: 'Blank', text: '  ' }])).toBe(
            'The keeper.\n\nAppearance: Silver hair, nine black-tipped tails.\n\nPowers: Reads a fight before it happens. Never kills.',
        );
        expect(roleText('', SECTIONS.slice(0, 1))).toBe('Appearance: Silver hair, nine black-tipped tails.');
        expect(roleText('The keeper.', [{ heading: '', text: 'Loves sweets.' }])).toBe('The keeper.\n\nLoves sweets.');
        expect(roleText('{n}.', [{ heading: '{n} past', text: 'Was {n}.' }], (t) => t.replaceAll('{n}', 'Rin'))).toBe('Rin.\n\nRin past: Was Rin.');
    });
});

describe('Role sections (API)', () => {
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

    async function story(): Promise<{ storyId: number; mira: number }> {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Moonwood' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A silver forest.', opening: '@Mira: Who goes there?' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: '{name}', description: '{name}, a fox reborn.' }).expect(200);
        const added = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' })
            .expect(201);
        await t.http
            .put(`/api/stories/${storyId}/opening-questions`)
            .send({ openingQuestions: [{ key: 'name', question: 'Your name?', defaultAnswer: 'Rin' }] })
            .expect(200);
        return { storyId, mira: added.body.characters[0].id as number };
    }
    const patchRole = (storyId: number, body: object) => t.http.patch(`/api/stories/${storyId}/role`).send(body);

    it('saves the whole list in order, trimmed, and a later list replaces it; other Role fields stay', async () => {
        const { storyId } = await story();
        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.role.sections).toEqual([]);

        const saved = (await patchRole(storyId, { sections: [{ heading: ' Appearance ', text: ' Silver hair, nine black-tipped tails.\n' }, SECTIONS[1]] }).expect(200)).body;
        expect(saved.role.sections).toEqual(SECTIONS);
        expect(saved.role.description).toBe('{name}, a fox reborn.');

        expect((await patchRole(storyId, { description: 'Changed.' }).expect(200)).body.role.sections).toEqual(SECTIONS);
        expect((await patchRole(storyId, { sections: [SECTIONS[1], SECTIONS[0]] }).expect(200)).body.role.sections).toEqual([SECTIONS[1], SECTIONS[0]]);
        expect((await patchRole(storyId, { sections: [{ heading: '  ', text: 'Loves sweets.' }] }).expect(200)).body.role.sections).toEqual([{ heading: '', text: 'Loves sweets.' }]);
        expect((await patchRole(storyId, { sections: [] }).expect(200)).body.role.sections).toEqual([]);
    });

    it('refuses a list that breaks a rule whole, changing nothing', async () => {
        const { storyId } = await story();
        await patchRole(storyId, { sections: SECTIONS }).expect(200);

        for (const sections of [
            [{ heading: 'Two\nlines', text: '' }],
            [{ heading: 'h'.repeat(61), text: '' }],
            Array.from({ length: 21 }, () => ({ heading: 'H', text: '' })),
        ]) {
            const refused = await patchRole(storyId, { sections }).expect(422);
            expect(refused.body.error.code).toBe('422.003.042');
        }
        await patchRole(storyId, { sections: [{ heading: 'No text' }] }).expect(400);
        await patchRole(storyId, { sections: [{ heading: 'Long', text: 'x'.repeat(20001) }] }).expect(400);
        await patchRole(storyId, { sections: 'Powers' }).expect(400);

        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.role.sections).toEqual(SECTIONS);
    });

    it('reaches the Narrator after the Description, placeholders filled; a blank section adds nothing', async () => {
        const { storyId } = await story();
        await patchRole(storyId, { sections: [{ heading: '{name} looks', text: 'Silver hair. {name} smiles.' }, { heading: 'Later', text: '' }] }).expect(200);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).send({ answers: { name: 'Petch' } }).expect(201)).body;

        t.gateway.scriptText('turn', '@Mira: Sit.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'I sit.' }).expect(201);
        await t.app.get(ChatManagerService).backgroundIdle(chat.id);

        expect(layersOf(t.gateway.textCalls('turn')[0])).toContain(`${PROMPT_LAYERS.identity}\nPetch: Petch, a fox reborn.\n\nPetch looks: Silver hair. Petch smiles.`);
    });

    it('a Role without sections reaches the Narrator exactly as before', async () => {
        const { storyId } = await story();
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).send({}).expect(201)).body;

        t.gateway.scriptText('turn', '@Mira: Sit.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'I sit.' }).expect(201);
        await t.app.get(ChatManagerService).backgroundIdle(chat.id);

        expect(layersOf(t.gateway.textCalls('turn')[0])).toContain(`${PROMPT_LAYERS.identity}\nRin: Rin, a fox reborn.`);
    });

    it('Duplicate copies the sections', async () => {
        const { storyId } = await story();
        await patchRole(storyId, { sections: SECTIONS }).expect(200);
        expect((await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body.role.sections).toEqual(SECTIONS);
    });

    it('a Character card carries the sections as written, and a card without them writes the block as before', async () => {
        const exportCard = async (storyId: number, characterId: number) =>
            (
                await t.http
                    .post(`/api/stories/${storyId}/characters/${characterId}/card`)
                    .attach('image', pngImage(), 'card.png')
                    .buffer(true)
                    .parse((res, done) => {
                        const parts: Buffer[] = [];
                        res.on('data', (part: Buffer) => parts.push(part));
                        res.on('end', () => done(null, Buffer.concat(parts)));
                    })
                    .expect(200)
            ).body as Buffer;
        const blockOf = (png: Buffer) => JSON.parse(Buffer.from(readText(readChunks(png), 'ccv3')!, 'base64').toString('utf8')).data.extensions.storytell;

        const { storyId, mira } = await story();
        expect(Object.keys(blockOf(await exportCard(storyId, mira)).role)).toEqual(['name', 'description']);

        const sections = [{ heading: 'Past', text: '{name} kept a café.' }, ...SECTIONS];
        await patchRole(storyId, { sections }).expect(200);
        const png = await exportCard(storyId, mira);
        expect(blockOf(png).role.sections).toEqual(sections);

        const back = (await t.http.post('/api/stories/from-card').attach('card', png, 'mira.png').field('roleName', '{name}').expect(201)).body;
        expect(back.role.sections).toEqual(sections);
    });
});

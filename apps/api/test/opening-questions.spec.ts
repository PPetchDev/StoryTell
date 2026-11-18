import { mapCard } from '../src/manager/character-card/card-mapping.js';
import { readChunks, readText } from '../src/manager/character-card/card-png.js';
import { readCardJson } from '../src/manager/character-card/card-reader.js';
import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { PROMPT_LAYERS } from '../src/manager/chat/turn/prompt.js';
import { pngImage } from './harness/card-files.js';
import { layersOf } from './harness/prompt-layers.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * .scratch/opening-questions/spec.md through the HTTP API: a Story's Opening questions save as a
 * whole list and validate; a new Chat keeps its answers and has them in its Opening and its Role;
 * Reset keeps them, a Branch copies them, Duplicate copies the questions, and a Character card
 * carries them. A Story without questions makes Chats exactly as before. Everyone is an adult.
 */

const OPENING = 'Rain hammers the glass as {name} climbs the stair.\n\n@Mira: You are the new {trade}? Boots off.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const QUESTIONS = [
    { key: 'name', question: 'What is your name?', defaultAnswer: 'Ash' },
    { key: 'trade', question: 'What is your trade?', defaultAnswer: 'keeper' },
];

interface Part {
    kind: string;
    text: string;
    speakerName?: string;
}

describe('Opening questions', () => {
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

    async function story(options: { questions?: object[]; opening?: string; role?: { name: string; description: string } } = {}): Promise<{ storyId: number; mira: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a cliff.', opening: options.opening ?? OPENING }).expect(200);
        await t.http
            .patch(`/api/stories/${storyId}/role`)
            .send(options.role ?? { name: '{name}', description: '{name}, a {trade} sent to keep the lamp. {unasked}' })
            .expect(200);
        const added = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall, grey-eyed.', personality: 'Dry.', voice: 'Short.' })
            .expect(201);
        if (options.questions !== undefined) await put(storyId, options.questions).expect(200);
        return { storyId, mira: added.body.characters[0].id as number };
    }

    const put = (storyId: number, openingQuestions: object[]) => t.http.put(`/api/stories/${storyId}/opening-questions`).send({ openingQuestions });
    const startChat = async (storyId: number, body?: object) => (await t.http.post(`/api/stories/${storyId}/chats`).send(body).expect(201)).body;
    const openingText = (chat: { messages: Array<{ parts: Part[] }> }) => chat.messages[0].parts.map((part) => part.text).join(' / ');

    it('saves the whole list in order, trimmed, with the key lower-cased, and a later list replaces it', async () => {
        const { storyId } = await story();

        const saved = (
            await put(storyId, [
                { key: '  Name ', question: ' What is your name? ', defaultAnswer: ' Ash ' },
                { key: 'home_town2', question: 'Where are you from?', defaultAnswer: 'the\nvalley' },
            ]).expect(200)
        ).body;

        expect(saved.openingQuestions).toEqual([
            { key: 'name', question: 'What is your name?', defaultAnswer: 'Ash' },
            { key: 'home_town2', question: 'Where are you from?', defaultAnswer: 'the valley' },
        ]);
        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.openingQuestions).toEqual(saved.openingQuestions);

        expect((await put(storyId, [QUESTIONS[1], QUESTIONS[0]]).expect(200)).body.openingQuestions).toEqual([QUESTIONS[1], QUESTIONS[0]]);
        expect((await put(storyId, []).expect(200)).body.openingQuestions).toEqual([]);
    });

    it('refuses a list that breaks a rule whole, changing nothing', async () => {
        const { storyId } = await story({ questions: QUESTIONS });
        const one = (fields: object) => [QUESTIONS[0], { ...QUESTIONS[1], ...fields }];

        for (const list of [
            one({ key: '2nd' }),
            one({ key: 'my trade' }),
            one({ key: 'trade!' }),
            one({ key: 'user' }),
            one({ key: 'CHAR' }),
            one({ key: 'name' }),
            one({ key: 'a'.repeat(31) }),
            one({ question: '   ' }),
            one({ defaultAnswer: ' \n ' }),
            Array.from({ length: 9 }, (_, index) => ({ key: `q${index}`, question: 'Why?', defaultAnswer: 'Because.' })),
        ]) {
            const refused = await put(storyId, list).expect(422);
            expect(refused.body.error.code).toBe('422.003.040');
        }
        await put(storyId, [{ key: 'name', question: 'What is your name?' }]).expect(400);
        await put(storyId, [{ key: 'name', question: 'x'.repeat(201), defaultAnswer: 'Ash' }]).expect(400);
        await t.http.put(`/api/stories/${storyId}/opening-questions`).send({}).expect(400);

        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.openingQuestions).toEqual(QUESTIONS);
    });

    it('a new Chat keeps its answers, and has them in its Opening and its Role, which reach the Narrator', async () => {
        const { storyId } = await story({ questions: QUESTIONS });

        const chat = await startChat(storyId, { answers: { name: '  Petch ', trade: 'herder' } });

        expect(chat.openingAnswers).toEqual({ name: 'Petch', trade: 'herder' });
        expect(chat.identityName).toBe('Petch');
        expect(chat.roleName).toBe('Petch');
        expect(chat.messages[0].parts).toEqual([
            { kind: 'narration', text: 'Rain hammers the glass as Petch climbs the stair.' },
            expect.objectContaining({ kind: 'speech', speakerName: 'Mira', text: 'You are the new herder? Boots off.' }),
        ]);

        t.gateway.scriptText('turn', '@Mira: Sit, herder.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
        const sent = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'I hang my coat.' }).expect(201)).body;
        await t.app.get(ChatManagerService).backgroundIdle(chat.id);
        // A placeholder the Story doesn't ask stays as written.
        expect(layersOf(t.gateway.textCalls('turn')[0])).toContain(`${PROMPT_LAYERS.identity}\nPetch: Petch, a herder sent to keep the lamp. {unasked}`);
        expect(sent.messages.at(-2)).toMatchObject({ kind: 'user', identityName: 'Petch' });
    });

    it('a blank, missing or no answer takes the default; an answer the Story does not ask is ignored; each is one line of 200 at most', async () => {
        const { storyId } = await story({ questions: QUESTIONS });

        const blank = await startChat(storyId, { answers: { name: '   ', other: 'ignored' } });
        expect(blank.openingAnswers).toEqual({ name: 'Ash', trade: 'keeper' });
        expect(openingText(blank)).toBe('Rain hammers the glass as Ash climbs the stair. / You are the new keeper? Boots off.');

        const skipped = await startChat(storyId);
        expect(skipped.openingAnswers).toEqual({ name: 'Ash', trade: 'keeper' });
        expect(skipped.identityName).toBe('Ash');

        const long = await startChat(storyId, { answers: { name: 'Petch\nof the\thills', trade: 'x'.repeat(300), extra: 3 } });
        expect(long.openingAnswers).toEqual({ name: 'Petch of the hills', trade: 'x'.repeat(200) });

        const odd = await startChat(storyId, { answers: { name: 7 } });
        expect(odd.openingAnswers).toEqual({ name: 'Ash', trade: 'keeper' });
        await t.http.post(`/api/stories/${storyId}/chats`).send({ answers: 'Petch' }).expect(400);
    });

    it('a Story without questions makes its Chats exactly as before, braces and all', async () => {
        const { storyId } = await story({ role: { name: 'Ash', description: 'The keeper, {name} to nobody.' } });

        const chat = await startChat(storyId, { answers: { name: 'Petch' } });

        expect(chat.openingAnswers).toBeNull();
        expect(chat.identityName).toBe('Ash');
        expect(openingText(chat)).toBe('Rain hammers the glass as {name} climbs the stair. / You are the new {trade}? Boots off.');
        const plain = await startChat(storyId);
        expect(plain.openingAnswers).toBeNull();
    });

    it('Reset keeps the answers, and a question added since reads its default', async () => {
        const { storyId } = await story({ questions: QUESTIONS });
        const chat = await startChat(storyId, { answers: { name: 'Petch', trade: 'herder' } });
        await put(storyId, [...QUESTIONS, { key: 'boat', question: 'What is your boat called?', defaultAnswer: 'the Gull' }]).expect(200);
        await t.http.patch(`/api/stories/${storyId}`).send({ opening: '{name} the {trade} ties up {boat}.' }).expect(200);

        const reset = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200)).body;

        expect(reset.openingAnswers).toEqual({ name: 'Petch', trade: 'herder' });
        expect(openingText(reset)).toBe('Petch the herder ties up the Gull.');
        expect(reset.identityName).toBe('Petch');
    });

    it('a Branch copies the answers', async () => {
        const { storyId } = await story({ questions: QUESTIONS });
        const chat = await startChat(storyId, { answers: { name: 'Petch', trade: 'herder' } });

        const branched = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${chat.messages[0].id}/branch`).expect(201)).body;
        const branch = (await t.http.get(`/api/stories/${storyId}/chats/${branched.chat?.id ?? branched.id}`).expect(200)).body;

        expect(branch.id).not.toBe(chat.id);
        expect(branch.openingAnswers).toEqual({ name: 'Petch', trade: 'herder' });
        expect(branch.identityName).toBe('Petch');
    });

    it('Duplicate copies the questions, and Preview the Opening reads the defaults', async () => {
        const { storyId } = await story({ questions: QUESTIONS });

        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body;
        expect(copy.openingQuestions).toEqual(QUESTIONS);

        const preview = (await t.http.get(`/api/stories/${storyId}/opening`).expect(200)).body;
        expect(preview.parts.map((part: Part) => part.text)).toEqual(['Rain hammers the glass as Ash climbs the stair.', 'You are the new keeper? Boots off.']);
    });

    describe('Character cards', () => {
        const exportCard = (storyId: number, characterId: number) =>
            t.http
                .post(`/api/stories/${storyId}/characters/${characterId}/card`)
                .attach('image', pngImage(), 'card.png')
                .buffer(true)
                .parse((res, done) => {
                    const parts: Buffer[] = [];
                    res.on('data', (part: Buffer) => parts.push(part));
                    res.on('end', () => done(null, Buffer.concat(parts)));
                })
                .expect(200);
        const definitionsOf = (png: Buffer) =>
            ['chara', 'ccv3'].map((keyword) => JSON.parse(Buffer.from(readText(readChunks(png), keyword)!, 'base64').toString('utf8')));

        it('export carries the questions and the Opening as written; another app reads the defaults; import asks them again', async () => {
            const { storyId, mira } = await story({ questions: QUESTIONS });
            const png = (await exportCard(storyId, mira)).body as Buffer;

            for (const definition of definitionsOf(png)) {
                expect(definition.data.first_mes).toBe('Rain hammers the glass as {{user}} climbs the stair.\n\n@Mira: You are the new keeper? Boots off.');
                expect(definition.data.extensions.storytell).toMatchObject({
                    openingQuestions: QUESTIONS,
                    opening: OPENING,
                    role: { name: '{name}', description: '{name}, a {trade} sent to keep the lamp. {unasked}' },
                });
            }

            const preview = (await t.http.post('/api/stories/from-card/preview').attach('card', png, 'mira.png').expect(200)).body;
            expect(preview.roleName).toBe('{name}');
            const back = (await t.http.post('/api/stories/from-card').attach('card', png, 'mira.png').field('roleName', '{name}').expect(201)).body;
            expect(back.openingQuestions).toEqual(QUESTIONS);
            expect(back.opening).toBe(OPENING);
            expect(back.role).toMatchObject({ name: '{name}', description: '{name}, a {trade} sent to keep the lamp. {unasked}' });

            const chat = await startChat(back.id, { answers: { name: 'Petch' } });
            expect(openingText(chat)).toBe('Rain hammers the glass as Petch climbs the stair. / You are the new keeper? Boots off.');
        });

        it('a Story without questions writes the block as before, and a broken list stays home, listed', async () => {
            const { storyId, mira } = await story({ role: { name: 'Ash', description: 'The keeper.' }, opening: 'Rain.' });
            const [v2] = definitionsOf((await exportCard(storyId, mira)).body as Buffer);
            expect(Object.keys(v2.data.extensions.storytell)).not.toContain('openingQuestions');
            expect(Object.keys(v2.data.extensions.storytell)).not.toContain('opening');
            expect(mapCard(readCardJson(JSON.stringify(v2)).card, { roleName: 'Ash', greeting: 0 }).openingQuestions).toEqual([]);

            v2.data.extensions.storytell.openingQuestions = [{ key: 'user', question: 'Who?', defaultAnswer: 'Me' }];
            v2.data.extensions.storytell.opening = '{user} arrives.';
            const plan = mapCard(readCardJson(JSON.stringify(v2)).card, { roleName: 'Ash', greeting: 0 });
            expect(plan.openingQuestions).toEqual([]);
            expect(plan.story.opening).toBe('Rain.');
            expect(plan.leftOut.some((line) => line.startsWith('The Opening questions ('))).toBe(true);
        });
    });
});

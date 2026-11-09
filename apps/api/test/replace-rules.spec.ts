import { readFileSync } from 'node:fs';
import pg from 'pg';

import { applyReplaceRules, ReplaceRuleLogic } from '../src/manager/replace-rule/apply-replace-rules.js';
import { CHANGES_TWICE, checkReplaceRule, CHECK_TIME_LIMIT_MS, MATCHES_EMPTY, TOO_SLOW } from '../src/manager/replace-rule/replace-rule-check.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface ReplaceCase {
    name: string;
    rules: ReplaceRuleLogic[];
    text: string;
    repeat?: number;
    expected?: string;
    unchanged?: true;
    expectedRepeat?: { text: string; repeat: number };
}

/** The one table both copies of the apply function answer to; the web's e2e reads it too. */
const { cases } = JSON.parse(readFileSync(new URL('./fixtures/replace-rule-cases.json', import.meta.url), 'utf8')) as { cases: ReplaceCase[] };

function expectedOf(entry: ReplaceCase): string {
    const text = entry.text.repeat(entry.repeat ?? 1);
    if (entry.unchanged) return text;
    if (entry.expectedRepeat) return entry.expectedRepeat.text.repeat(entry.expectedRepeat.repeat);
    return entry.expected!;
}

const rule = (fields: Partial<ReplaceRuleLogic & { onMine: boolean }> & { find: string }) => ({
    replace: '',
    regex: false,
    ignoreCase: false,
    onMine: false,
    ...fields,
});

// .scratch/saved-replies-and-replace-rules/spec.md: "Meaning of a rule".
describe('applyReplaceRules (pure)', () => {
    it.each(cases.map((entry) => [entry.name, entry] as const))('%s', (_name, entry) => {
        expect(applyReplaceRules(entry.text.repeat(entry.repeat ?? 1), entry.rules)).toBe(expectedOf(entry));
    });

    it('the table covers every case the spec lists', () => {
        const names = cases.map((entry) => entry.name).join('\n');
        for (const topic of ['plain', 'Ignore case', '$1', 'named groups', 'empty replacement', 'order', 'Thai', 'guard', 'throws']) {
            expect(names).toContain(topic);
        }
    });

    it('leaves the text alone with no rules', () => {
        expect(applyReplaceRules('As it is.', [])).toBe('As it is.');
    });
});

// Spec: "Checks at save".
describe('Replace rule save checks (pure)', () => {
    it("refuses a regex that doesn't compile, with the engine's reason", async () => {
        const reason = await checkReplaceRule(rule({ find: '(unclosed', regex: true }));
        expect(reason).toMatch(/Invalid regular expression/);
        expect(reason).toMatch(/Unterminated group/);
    });

    it('refuses a pattern that matches empty text', async () => {
        expect(await checkReplaceRule(rule({ find: 'x*', regex: true, replace: '-' }))).toBe(MATCHES_EMPTY);
        expect(await checkReplaceRule(rule({ find: '\\b', regex: true, replace: '|' }))).toBe(MATCHES_EMPTY);
        expect(await checkReplaceRule(rule({ find: '(?=a)', regex: true, replace: '|' }))).toBe(MATCHES_EMPTY);
    });

    it('refuses a catastrophic pattern as too slow, within the time limit', async () => {
        const started = Date.now();
        expect(await checkReplaceRule(rule({ find: '(a+)+$', regex: true, replace: 'b' }))).toBe(TOO_SLOW);
        expect(Date.now() - started).toBeLessThan(CHECK_TIME_LIMIT_MS + 3_000);
    });

    it('accepts a normal regex and a plain rule', async () => {
        expect(await checkReplaceRule(rule({ find: '(\\w+) smirked', regex: true, replace: '$1 smiled' }))).toBeNull();
        expect(await checkReplaceRule(rule({ find: 'a shiver ran down her spine', replace: '', ignoreCase: true }))).toBeNull();
    });

    it('refuses an On my Messages rule that changes its own output again, and accepts one that does not', async () => {
        expect(await checkReplaceRule(rule({ find: 'cat', replace: 'cats', onMine: true }))).toBe(CHANGES_TWICE);
        expect(await checkReplaceRule(rule({ find: '(\\w+)', regex: true, replace: '$1s', onMine: true }))).toBe(CHANGES_TWICE);
        expect(await checkReplaceRule(rule({ find: 'colour', replace: 'color', onMine: true }))).toBeNull();
        expect(await checkReplaceRule(rule({ find: '\\bu\\b', regex: true, replace: 'you', onMine: true }))).toBeNull();
    });

    it('does not run the twice-run check on a rule only on AI Messages', async () => {
        expect(await checkReplaceRule(rule({ find: 'cat', replace: 'cats' }))).toBeNull();
        expect(await checkReplaceRule(rule({ find: '(\\w+)', regex: true, replace: '$1s' }))).toBeNull();
    });
});

interface StoredRule {
    id: number;
    find: string;
    replace: string;
    regex: boolean;
    ignoreCase: boolean;
    onAi: boolean;
    onMine: boolean;
}

// Spec: "Replace rules: storage and API".
describe('Replace rules API', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    beforeEach(async () => {
        // App-wide rules are shared by every test of this file.
        for (const stored of (await t.http.get('/api/replace-rules').expect(200)).body.replaceRules as StoredRule[]) {
            await t.http.delete(`/api/replace-rules/${stored.id}`).expect(200);
        }
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';

    async function createStory(title = 'The Lighthouse'): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
            .expect(201);
        return storyId;
    }

    const finds = (rules: StoredRule[]) => rules.map((stored) => stored.find);

    describe('app-wide', () => {
        it('adds with defaults, keeps Find untrimmed, edits only the fields sent, removes, each answering the list', async () => {
            const added = await t.http.post('/api/replace-rules').send({ find: ' smirked ' }).expect(201);
            expect(added.body.replaceRules).toEqual([
                { id: expect.any(Number), find: ' smirked ', replace: '', regex: false, ignoreCase: false, onAi: true, onMine: false },
            ]);
            const id = added.body.replaceRules[0].id as number;

            const edited = await t.http.patch(`/api/replace-rules/${id}`).send({ replace: ' smiled ', ignoreCase: true }).expect(200);
            expect(edited.body.replaceRules[0]).toMatchObject({ find: ' smirked ', replace: ' smiled ', ignoreCase: true, onAi: true });
            const parked = await t.http.patch(`/api/replace-rules/${id}`).send({ onAi: false }).expect(200);
            expect(parked.body.replaceRules[0]).toMatchObject({ onAi: false, onMine: false });

            expect((await t.http.get('/api/replace-rules').expect(200)).body.replaceRules).toEqual(parked.body.replaceRules);
            const removed = await t.http.delete(`/api/replace-rules/${id}`).expect(200);
            expect(removed.body.replaceRules).toEqual([]);
        });

        it('reorders, and refuses an order that is not every rule exactly once with the widened InvalidOrderError', async () => {
            await t.http.post('/api/replace-rules').send({ find: 'one' }).expect(201);
            await t.http.post('/api/replace-rules').send({ find: 'two' }).expect(201);
            const { body } = await t.http.post('/api/replace-rules').send({ find: 'three' }).expect(201);
            const [one, two, three] = (body.replaceRules as StoredRule[]).map((stored) => stored.id);
            expect(finds(body.replaceRules)).toEqual(['one', 'two', 'three']);

            const moved = await t.http.put('/api/replace-rules/order').send({ ids: [three, one, two] }).expect(200);
            expect(finds(moved.body.replaceRules)).toEqual(['three', 'one', 'two']);

            for (const ids of [[one, two], [one, one, two], [one, two, three, 999999]]) {
                const refused = await t.http.put('/api/replace-rules/order').send({ ids }).expect(422);
                expect(refused.body.error).toEqual({
                    code: '422.003.008',
                    message: 'The order must list every one of your app-wide Replace rules exactly once.',
                });
            }
            expect(finds((await t.http.get('/api/replace-rules').expect(200)).body.replaceRules)).toEqual(['three', 'one', 'two']);
        });

        it('refuses an empty or over-long Find, a 51st rule and an unknown id', async () => {
            await t.http.post('/api/replace-rules').send({ find: '' }).expect(400);
            await t.http.post('/api/replace-rules').send({ find: 'x'.repeat(501) }).expect(400);
            await t.http.post('/api/replace-rules').send({ find: 'x', replace: 'y'.repeat(1_001) }).expect(400);
            for (let index = 1; index <= 50; index++) await t.http.post('/api/replace-rules').send({ find: `word${index}` }).expect(201);
            const tooMany = await t.http.post('/api/replace-rules').send({ find: 'one more' }).expect(422);
            expect(tooMany.body.error.code).toBe('422.008.004');

            const unknown = await t.http.patch('/api/replace-rules/999999').send({ replace: 'x' }).expect(404);
            expect(unknown.body.error.code).toBe('404.008.005');
            await t.http.delete('/api/replace-rules/999999').expect(404);
        });
    });

    describe('save checks', () => {
        async function refusal(body: object, path = '/api/replace-rules', method: 'post' | 'patch' = 'post') {
            const response = await t.http[method](path).send(body).expect(422);
            expect(response.body.error.code).toBe('422.008.006');
            return response.body.error.message as string;
        }

        it("refuses a regex that doesn't compile, one matching empty text and one too slow, saving nothing", async () => {
            expect(await refusal({ find: '(unclosed', regex: true })).toMatch(/Invalid regular expression.*Unterminated group/);
            expect(await refusal({ find: 'x*', regex: true, replace: '-' })).toBe('This would match between every letter');
            expect(await refusal({ find: '(a+)+$', regex: true, replace: 'b' })).toBe('This pattern is too slow');
            expect((await t.http.get('/api/replace-rules').expect(200)).body.replaceRules).toEqual([]);
        });

        it('refuses an On my Messages rule that changes its own output again; the same rule only on AI Messages saves', async () => {
            expect(await refusal({ find: 'cat', replace: 'cats', onMine: true })).toBe('This rule would change your text again if run twice');
            await t.http.post('/api/replace-rules').send({ find: 'colour', replace: 'color', onMine: true }).expect(201);
            const { body } = await t.http.post('/api/replace-rules').send({ find: 'cat', replace: 'cats' }).expect(201);
            const cat = (body.replaceRules as StoredRule[]).find((stored) => stored.find === 'cat')!;

            // Switching On my Messages on for the saved rule runs the check, and the saved version stays.
            const path = `/api/replace-rules/${cat.id}`;
            expect(await refusal({ onMine: true }, path, 'patch')).toBe('This rule would change your text again if run twice');
            // So does an edit that would make a valid rule invalid.
            expect(await refusal({ find: '(', regex: true }, path, 'patch')).toMatch(/Invalid regular expression/);
            const stored = (await t.http.get('/api/replace-rules').expect(200)).body.replaceRules as StoredRule[];
            expect(stored.find((candidate) => candidate.id === cat.id)).toMatchObject({ find: 'cat', replace: 'cats', regex: false, onMine: false });
        });

        it('checks a Story rule the same way', async () => {
            const storyId = await createStory();
            expect(await refusal({ find: '\\b', regex: true }, `/api/stories/${storyId}/replace-rules`)).toBe('This would match between every letter');
            const { body } = await t.http.get(`/api/stories/${storyId}`).expect(200);
            expect(body.replaceRules).toEqual([]);
        });
    });

    describe("a Story's own", () => {
        it('adds, edits, reorders and removes, each answering the whole Story', async () => {
            const storyId = await createStory();
            const first = await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'grin', replace: 'smile' }).expect(201);
            expect(first.body.title).toBe('The Lighthouse');
            const second = await t.http
                .post(`/api/stories/${storyId}/replace-rules`)
                .send({ find: '(\\w+) sighed', replace: '$1 breathed out', regex: true, onAi: false, onMine: true })
                .expect(201);
            const [grin, sighed] = second.body.replaceRules as StoredRule[];
            expect(sighed).toMatchObject({ regex: true, onAi: false, onMine: true });

            const edited = await t.http.patch(`/api/stories/${storyId}/replace-rules/${grin.id}`).send({ find: 'grinned' }).expect(200);
            expect(finds(edited.body.replaceRules)).toEqual(['grinned', '(\\w+) sighed']);

            const moved = await t.http.put(`/api/stories/${storyId}/replace-rules/order`).send({ ids: [sighed.id, grin.id] }).expect(200);
            expect(finds(moved.body.replaceRules)).toEqual(['(\\w+) sighed', 'grinned']);
            const refused = await t.http.put(`/api/stories/${storyId}/replace-rules/order`).send({ ids: [sighed.id] }).expect(422);
            expect(refused.body.error).toEqual({
                code: '422.003.008',
                message: "The order must list every one of the Story's Replace rules exactly once.",
            });

            const removed = await t.http.delete(`/api/stories/${storyId}/replace-rules/${sighed.id}`).expect(200);
            expect(finds(removed.body.replaceRules)).toEqual(['grinned']);
        });

        it('keeps the scopes apart, and answers 404 for an unknown Story', async () => {
            const storyId = await createStory();
            const other = await createStory('Other');
            const app = (await t.http.post('/api/replace-rules').send({ find: 'app' }).expect(201)).body.replaceRules[0] as StoredRule;
            const mine = (await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'mine' }).expect(201)).body.replaceRules[0] as StoredRule;

            const viaStory = await t.http.patch(`/api/stories/${storyId}/replace-rules/${app.id}`).send({ replace: 'x' }).expect(404);
            expect(viaStory.body.error.code).toBe('404.008.005');
            await t.http.delete(`/api/stories/${other.toString()}/replace-rules/${mine.id}`).expect(404);
            await t.http.patch(`/api/replace-rules/${mine.id}`).send({ replace: 'x' }).expect(404);
            // An app-wide reorder counts only app-wide rules.
            await t.http.put('/api/replace-rules/order').send({ ids: [app.id, mine.id] }).expect(422);

            const missing = await t.http.post('/api/stories/999999/replace-rules').send({ find: 'x' }).expect(404);
            expect(missing.body.error.code).toBe('404.003.001');
        });

        it('is copied by Duplicate Story, in order and with every switch, and goes with the Story when it is deleted', async () => {
            const storyId = await createStory();
            await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'Grin', replace: 'smile', ignoreCase: true }).expect(201);
            const { body: source } = await t.http
                .post(`/api/stories/${storyId}/replace-rules`)
                .send({ find: 'colour', replace: 'color', onAi: false, onMine: true })
                .expect(201);

            const { body: copy } = await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201);
            const strip = (rules: StoredRule[]) => rules.map(({ id: _id, ...fields }) => fields);
            expect(strip(copy.replaceRules)).toEqual(strip(source.replaceRules));
            expect(copy.replaceRules.map((stored: StoredRule) => stored.id)).not.toContain(source.replaceRules[0].id);

            await t.http.post('/api/replace-rules').send({ find: 'stays' }).expect(201);
            await t.http.delete(`/api/stories/${storyId}`).expect(204);
            const client = new pg.Client({ connectionString: t.databaseUrl });
            await client.connect();
            const { rows } = await client.query<{ find: string }>('SELECT find FROM replace_rule WHERE story_id = $1 OR story_id IS NULL ORDER BY id', [storyId]);
            await client.end();
            expect(rows).toEqual([{ find: 'stays' }]);
            // The copy keeps its own.
            expect(finds((await t.http.get(`/api/stories/${copy.id}`).expect(200)).body.replaceRules)).toEqual(['Grin', 'colour']);
        });
    });

    it("the Chat detail lists the rules in apply order, app-wide then the Story's, without parked ones", async () => {
        const storyId = await createStory();
        await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'story one' }).expect(201);
        await t.http.post('/api/replace-rules').send({ find: 'app one', onAi: false, onMine: true }).expect(201);
        await t.http.post(`/api/stories/${storyId}/replace-rules`).send({ find: 'story parked', onAi: false }).expect(201);
        const appTwo = await t.http.post('/api/replace-rules').send({ find: 'app two', replace: 'II', regex: true, ignoreCase: true }).expect(201);
        await t.http.post('/api/replace-rules').send({ find: 'app parked', onAi: false, onMine: false }).expect(201);
        const [one, two] = (appTwo.body.replaceRules as StoredRule[]).map((stored) => stored.id);
        const rest = ((await t.http.get('/api/replace-rules').expect(200)).body.replaceRules as StoredRule[]).slice(2).map((stored) => stored.id);
        await t.http.put('/api/replace-rules/order').send({ ids: [two, one, ...rest] }).expect(200);

        const { body } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        expect(body.replaceRules).toEqual([
            { find: 'app two', replace: 'II', regex: true, ignoreCase: true, onAi: true, onMine: false },
            { find: 'app one', replace: '', regex: false, ignoreCase: false, onAi: false, onMine: true },
            { find: 'story one', replace: '', regex: false, ignoreCase: false, onAi: true, onMine: false },
        ]);
    });

    it('leaves the existing reorder messages for Characters as they were', async () => {
        const storyId = await createStory();
        const refused = await t.http.put(`/api/stories/${storyId}/characters/order`).send({ characterIds: [] }).expect(422);
        expect(refused.body.error).toEqual({ code: '422.003.008', message: "The order must list every one of the Story's Characters exactly once." });
    });
});

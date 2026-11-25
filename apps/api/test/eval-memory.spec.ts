import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fakeEmbeddingFeatures } from '../src/service/model-gateway/fake-embedding.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { OpenRouterClient } from '../src/service/model-gateway/real/openrouter-client.js';
import { existsSync, readFileSync } from 'node:fs';

import { memoryCost } from '../src/manager/chat/memory/memory-choice.js';
import { buildTurnPrompt } from '../src/manager/chat/turn/prompt.js';
import { GRADER_CASES, graderCaseProblems } from './live/eval-grade.js';
import { ANCHORS, BRAM, CORIN, FIXTURE_MEMORIES, FixtureMemory, ILSE, ILSE_BELIEF, MEMORY_CAST, SERA, STORY_SMALL_TALK, storyMessages } from './live/eval-memory-fixture.js';
import { ACCOUNT_SCENE, ChoiceCase, CHOICE_CASES, CURRENT_STATE, EXTRACTION_SCENES, FILLER_MEMORIES, MEMORY_GRADER_CASES, USE_SCENES } from './live/eval-memory-scenes.js';
import { formatMemoryScorecard, MemoryReport, runMemoryEval, startMemoryEval } from './live/eval-memory-run.js';
import { scenePromptProblems, scores } from './live/eval-run.js';
import { EVAL_SCENES } from './live/eval-scenes.js';

/**
 * The long-term memory eval (.scratch/long-term-memory-eval/spec.md), through its one seam: the
 * run, with its HTTP client handed in. Every answer here is scripted; nothing reaches the network.
 */

const GRADER_MODEL = 'deepseek/deepseek-v4-flash';
const GIT = { commit: 'abc1234', dirty: false };
const DIMENSIONS = 1024;

type Role = 'play' | 'writer' | 'extraction' | 'grader' | 'embedding';

interface Sent {
    role: Role;
    body: Record<string, any>;
}

/** A vector for a text from its words, at unit length: texts that share words score high, as the app's fake does. */
function wordVector(text: string): number[] {
    const vector = new Array<number>(DIMENSIONS).fill(0);
    for (const word of fakeEmbeddingFeatures(text)) {
        let hash = 7;
        for (const letter of word) hash = (hash * 31 + letter.charCodeAt(0)) % DIMENSIONS;
        vector[hash] += 1;
    }
    const length = Math.hypot(...vector) || 1;
    return vector.map((value) => value / length);
}

/** A vector along the first axes: `[x, y]` is x on the first and y on the second, so a score against `[1, 0]` is x. */
function axis(x: number, y = Math.sqrt(1 - x * x)): number[] {
    const vector = new Array<number>(DIMENSIONS).fill(0);
    vector[0] = x;
    vector[1] = y;
    return vector;
}

/**
 * A scripted OpenRouter: embeddings by `vectorOf`, and each kind of chat call (the play model, the
 * Story so far writer, the Memory extraction, the grader) answered by its own function.
 */
function scripted(script: { vectorOf?: (text: string) => number[]; answer?: Partial<Record<Exclude<Role, 'embedding'>, (body: Record<string, any>, index: number) => string | { status: number } | { text: string; completionTokens: number }>> } = {}) {
    const sent: Sent[] = [];
    const counts: Record<string, number> = {};
    const fetchImpl: FetchLike = async (url, init) => {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
        if (String(url).endsWith('/embeddings')) {
            sent.push({ role: 'embedding', body });
            const data = (body.input as string[]).map((text, index) => ({ index, embedding: (script.vectorOf ?? wordVector)(text) }));
            return new Response(JSON.stringify({ data, usage: { prompt_tokens: 10 * data.length, cost: 0.000001 } }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        const system: string = body.messages?.[0]?.content ?? '';
        const role: Role = body.model !== GRADER_MODEL ? 'play' : system.startsWith('You check ') ? 'grader' : system.startsWith('You keep the record') ? 'writer' : 'extraction';
        sent.push({ role, body });
        const index = counts[role] ?? 0;
        counts[role] = index + 1;
        const fallback: Record<Exclude<Role, 'embedding'>, string> = {
            play: 'Sera looked up from the gauge.\n\n@Sera Quill: Ask.',
            writer: 'Corin came to Harrowmere and stayed.',
            extraction: '{"operations":[]}',
            grader: '{"checks":[{"name":"x","quote":"a quote","pass":true}]}',
        };
        const answer = script.answer?.[role]?.(body, index) ?? fallback[role];
        if (typeof answer === 'object' && 'status' in answer) return new Response(JSON.stringify({ error: { message: 'Provider returned error', code: answer.status } }), { status: answer.status });
        const text = typeof answer === 'string' ? answer : answer.text;
        const completionTokens = typeof answer === 'string' ? 20 : answer.completionTokens;
        const json = { id: `gen-${sent.length}`, choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: completionTokens, cost: 0.001 } };
        return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    return { sent, fetchImpl, client: new OpenRouterClient('sk-or-test-not-a-real-key', fetchImpl, async () => {}) };
}

const tempDir = () => mkdtempSync(path.join(tmpdir(), 'memory-eval-'));

describe('The long Chat written for the memory eval', () => {
    it('is thirty Chapters of Memories, every one known by someone of the cast, with six anchors in the first five Chapters', () => {
        expect(FIXTURE_MEMORIES.length).toBeGreaterThanOrEqual(240);
        expect(new Set(FIXTURE_MEMORIES.map((memory) => memory.chapter)).size).toBe(30);
        const cast = MEMORY_CAST.map((character) => character.name);
        expect(FIXTURE_MEMORIES.filter((memory) => memory.knownBy.length === 0 || memory.knownBy.some((name) => !cast.includes(name)))).toEqual([]);
        expect(ANCHORS.map((anchor) => anchor.name)).toEqual(['rescue', 'report', 'fire', 'key', 'promise', 'secret']);
        expect(ANCHORS.every((anchor) => anchor.memory.chapter <= 5)).toBe(true);
    });

    it('gives each anchor a telltale that is in its own Memory and nowhere else: not in another Memory, a card or the Setting', () => {
        const cards = MEMORY_CAST.map((character) => Object.values(character).flat().join(' ')).join(' ');
        for (const anchor of ANCHORS) {
            expect(anchor.memory.text).toMatch(anchor.telltale);
            const elsewhere = FIXTURE_MEMORIES.filter((memory) => memory.id !== anchor.memory.id && anchor.telltale.test(memory.text)).map((memory) => memory.text);
            expect(elsewhere).toEqual([]);
            expect(cards).not.toMatch(anchor.telltale);
        }
        // The one telltale two texts share by design: what Ilse believes and what truly happened are the same night.
        expect(ILSE_BELIEF.text).toMatch(ANCHORS.find((anchor) => anchor.name === 'fire')!.telltale);
    });

    // The first run's Messages were the events alone, a sentence each: nothing to squeeze, so the writer overran its cap and the layer measured little.
    it('tells the story as Messages with weather and small talk between the events, so an account has something it may rightly drop', () => {
        const told = storyMessages(30).map((message) => message.text).join('\n');
        const events = FIXTURE_MEMORIES.map((memory) => memory.text.replaceAll('{user}', CORIN));
        expect(events.filter((event) => !told.includes(event))).toEqual([]);
        const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
        expect(words(told)).toBeGreaterThan(words(events.join(' ')) * 1.8);
        expect(STORY_SMALL_TALK.length).toBeGreaterThanOrEqual(30);
        expect(STORY_SMALL_TALK.filter((line) => told.includes(line)).length).toBeGreaterThanOrEqual(30);
        // The padding holds nothing an account is marked on.
        const marked = [...ANCHORS.map((anchor) => anchor.eventWords), /\bkey\b|Heron|Dunlin|Kestrel|nettle|Wren|Pepper|Miller|lantern/i];
        expect(STORY_SMALL_TALK.filter((line) => marked.some((word) => word.test(line)))).toEqual([]);
    });

    it('never writes the worn identity’s name in a Memory: {user}, as the app stores it', () => {
        expect(FIXTURE_MEMORIES.filter((memory) => new RegExp(`\\b${CORIN}\\b`).test(memory.text))).toEqual([]);
    });
});

describe('Layer 1, Choice: is the right Memory picked for the turn', () => {
    it('sends embeddings only, and asks the app’s own choice about each anchor by a direct cue, a context cue and an unrelated turn, then again with the budget crowded', async () => {
        const router = scripted();
        const report = await runMemoryEval({ layers: ['choice'], model: 'glm-5.3', client: router.client, git: GIT, vectorsFile: path.join(tempDir(), 'vectors.json') });

        expect(router.sent.every((one) => one.role === 'embedding')).toBe(true);
        expect(router.sent[0].body).toMatchObject({ model: 'baai/bge-m3', provider: { only: ['deepinfra'] } });
        expect(CHOICE_CASES.map((one) => `${one.anchor} ${one.cue}${one.crowded ? ' crowded' : ''}`)).toEqual(
            expect.arrayContaining(['rescue direct', 'rescue context', 'rescue unrelated', 'rescue direct crowded', 'rescue context crowded', 'secret direct', 'secret unrelated']),
        );
        // And once more with a quarter of the budget, as a Chat four times as long would leave it: being sent is then not nearly certain.
        expect(CHOICE_CASES).toHaveLength(6 * 3 + 6 * 2 + 6 * 2);
        expect(CHOICE_CASES.filter((one) => one.tight).map((one) => one.cue)).toEqual(expect.arrayContaining(['direct', 'context']));
        expect(report.choice!.results).toHaveLength(CHOICE_CASES.length);
        // A vector made of words ranks the Memory first for the turn that names its event. Whether it clears the floor is the real model's to say.
        const direct = report.choice!.results.find((one) => one.anchor === 'rescue' && one.cue === 'direct' && !one.crowded)!;
        expect(direct).toMatchObject({ rank: 1, budget: 4000, floor: 0.35 });
        expect(direct.found ? direct.whyNot : direct.reason).toBeNull();
        expect(direct.usedTokens).toBeLessThanOrEqual(4000);
        expect(report.choice!.memories).toBe(FIXTURE_MEMORIES.length);
        const tight = report.choice!.results.filter((one) => one.tight);
        expect(tight).toHaveLength(12);
        expect(tight.every((one) => one.budget === 1000 && one.usedTokens <= 1000)).toBe(true);
    });

    it('searches with what the app searches with: the user’s turn and the four Messages before it, newest first', async () => {
        const router = scripted();
        await runMemoryEval({ layers: ['choice'], model: 'glm-5.3', client: router.client, git: GIT, vectorsFile: path.join(tempDir(), 'vectors.json') });
        const inputs = router.sent.flatMap((one) => one.body.input as string[]);
        const first = CHOICE_CASES[0];
        expect(first.history).toHaveLength(4);
        expect(inputs).toContain([first.userText, ...[...first.history].reverse().map((message) => message.text)].join('\n\n'));
        // And every Memory as the app embeds it: its text, with {user}.
        expect(inputs).toContain(FIXTURE_MEMORIES[0].text);
    });

    /** A small Chat whose vectors are set by hand: the query is the first axis, so a Memory's score is its first number. */
    const crowd = (count: number, score: number): FixtureMemory[] =>
        Array.from({ length: count }, (_, index) => ({ id: index + 2, chapter: 9, topic: 'weather', text: `crowd ${index + 1}: the river rose again and the mill stood idle for a day.`, knownBy: ['Bram Oakes'] }));
    const lone: FixtureMemory = { id: 1, chapter: 1, topic: 'rescue', text: 'anchor: the thing that happened long ago.', knownBy: ['Bram Oakes'] };
    const oneCase: ChoiceCase = { anchor: 'rescue', cue: 'context', crowded: false, tight: false, with: SERA, userText: 'the query', history: [], topics: ['rescue'] };
    const byHand = (anchorScore: number) => (text: string) => (text === 'the query' ? axis(1, 0) : text.startsWith('anchor') ? axis(anchorScore) : axis(0.9));

    it('says an anchor that cleared the floor was left out for room, with how many ranked above it and the tokens they took', async () => {
        const router = scripted({ vectorOf: byHand(0.5) });
        const report = await runMemoryEval({
            layers: ['choice'],
            model: 'glm-5.3',
            client: router.client,
            git: GIT,
            vectorsFile: path.join(tempDir(), 'vectors.json'),
            choice: { memories: [lone, ...crowd(12, 0.9)], cases: [oneCase], anchorMemoryId: () => 1, budget: 120 },
        });
        const [result] = report.choice!.results;
        expect(result).toMatchObject({ found: false, reason: null, whyNot: 'over the floor, left out for room', rank: 13 });
        // Twelve ranked above it; those of them that were sent are what took its room.
        expect(result.aboveIt).toBeGreaterThan(0);
        expect(result.aboveIt).toBeLessThan(12);
        expect(result.score).toBeCloseTo(0.5, 5);
        expect(result.tokensAboveIt).toBeGreaterThan(0);
        expect(result.tokensAboveIt).toBeLessThanOrEqual(120);
    });

    it('says an anchor that scored under the floor was under the floor, which is the embedding’s doing and not the budget’s', async () => {
        const router = scripted({ vectorOf: byHand(0.2) });
        const report = await runMemoryEval({
            layers: ['choice'],
            model: 'glm-5.3',
            client: router.client,
            git: GIT,
            vectorsFile: path.join(tempDir(), 'vectors.json'),
            choice: { memories: [lone, ...crowd(12, 0.9)], cases: [oneCase], anchorMemoryId: () => 1, budget: 120 },
        });
        expect(report.choice!.results[0]).toMatchObject({ found: false, whyNot: 'under the floor', rank: 13 });
        expect(report.choice!.results[0].score).toBeCloseTo(0.2, 5);
    });

    it('counts, of the Memories chosen by meaning, those whose topic the cue does not list', async () => {
        const router = scripted({ vectorOf: byHand(0.95) });
        const report = await runMemoryEval({
            layers: ['choice'],
            model: 'glm-5.3',
            client: router.client,
            git: GIT,
            vectorsFile: path.join(tempDir(), 'vectors.json'),
            choice: { memories: [lone, ...crowd(3, 0.9)], cases: [oneCase], anchorMemoryId: () => 1, budget: 4000 },
        });
        // The anchor and three Memories about the weather, all over the floor: three of the four are off the cue's topics.
        expect(report.choice!.results[0]).toMatchObject({ found: true, reason: 'meaning', rank: 1, chosenByMeaning: 4, unrelatedByMeaning: 3 });
    });

    it('keeps the vectors on disk by text, so a second run sends nothing and costs nothing', async () => {
        const vectorsFile = path.join(tempDir(), 'vectors.json');
        const first = scripted();
        const one = await runMemoryEval({ layers: ['choice'], model: 'glm-5.3', client: first.client, git: GIT, vectorsFile });
        expect(first.sent.length).toBeGreaterThan(0);
        expect(one.totalUsd).toBeGreaterThan(0);

        const second = scripted();
        const two = await runMemoryEval({ layers: ['choice'], model: 'glm-5.3', client: second.client, git: GIT, vectorsFile });
        expect(second.sent).toEqual([]);
        expect(two.totalUsd).toBe(0);
        expect(two.choice!.results).toEqual(one.choice!.results);
    });

    it('stops before an embedding call that could pass the cap, and says so', async () => {
        const router = scripted();
        const report = await runMemoryEval({ layers: ['choice'], model: 'glm-5.3', client: router.client, git: GIT, vectorsFile: path.join(tempDir(), 'vectors.json'), capUsd: 0 });
        expect(router.sent).toEqual([]);
        expect(report.stoppedAtCap).toBe(true);
        expect(report.choice).toBeNull();
    });
});

const add = (text: string, knownBy: string[]) => ({ op: 'add', text, known_by: knownBy, cause: 'the exchange' });
const operations = (...list: object[]) => JSON.stringify({ operations: list });

/** For each extraction scene, by a word only its exchange holds: an answer every check passes, and one every check fails. */
const EXTRACTIONS: { scene: string; tells: string; good: string; bad: string }[] = [
    {
        scene: 'extract-event',
        tells: 'wades in to the chest',
        good: operations(add('{user} pulled Sera Quill’s brother Tobin from under the capsized skiff Marigold.', [SERA])),
        bad: operations(add('Corin saved a man today.', [SERA, BRAM])),
    },
    {
        scene: 'extract-away',
        tells: 'bill of lading',
        // As the real model wrote it: the name, and the user among those who know. The app mends both when it stores the Memory.
        good: operations(add('Bram Oakes told Corin he cannot read; his niece Odalys keeps his ledger.', [BRAM, CORIN, '{user}'])),
        bad: operations(add('Bram Oakes cannot read, as Corin learned.', [BRAM, SERA])),
    },
    {
        scene: 'extract-lie',
        tells: 'in the ash of her',
        good: operations(
            { op: 'believe', character: ILSE, text: '{user} set the fire that burned her shed.', contradicts: null, cause: 'Bram said so' },
            add('Bram Oakes’s lantern started the fire in Ilse Varn’s shed; he told Ilse Varn he had seen {user} there with a torch, which was a lie.', [BRAM]),
        ),
        bad: operations(add('{user} set the fire that burned Ilse Varn’s shed.', [ILSE, BRAM])),
    },
    {
        scene: 'extract-change',
        tells: 'finishes the splint',
        good: operations({ op: 'update', id: 1, text: 'Sera Quill gave the silver lock key to Ilse Varn to keep; Ilse holds it now.', cause: 'she handed it over' }),
        bad: operations(add('Sera Quill broke her wrist.', [SERA])),
    },
    {
        scene: 'extract-buried',
        tells: 'nearly lost a boot',
        good: operations(add('{user} promised Ilse Varn to bring her ghostcap moss before the first frost.', [ILSE])),
        bad: operations(add('It rains in autumn.', [ILSE, SERA]), add('The cooper’s boy lost a boot.', [ILSE, SERA]), add('Corin talked about the lane.', [ILSE, SERA])),
    },
];

const promptOf = (body: Record<string, any>): string => (body.messages as { content: string }[]).map((message) => message.content).join('\n');

describe('Layer 2, Extraction: is an event stored as a right Memory', () => {
    const answering = (which: 'good' | 'bad') => (body: Record<string, any>) => EXTRACTIONS.find((one) => promptOf(body).includes(one.tells))![which];

    it('plays five scenes on the background model through the app’s own extraction prompt, and nothing else', async () => {
        const router = scripted({ answer: { extraction: answering('good') } });
        const report = await runMemoryEval({ layers: ['extraction'], model: 'glm-5.3', client: router.client, git: GIT, samples: 2 });
        expect(router.sent.map((one) => one.role)).toEqual(new Array(10).fill('extraction'));
        expect(router.sent[0].body).toMatchObject({ model: GRADER_MODEL, response_format: { type: 'json_object' } });
        expect(report.extraction!.scenes.map((scene) => scene.name)).toEqual(EXTRACTIONS.map((one) => one.scene));
    });

    it('checks what happened, who was in it, who knows it, and fact against belief, each as a check of its own that a right answer passes and a wrong one fails', async () => {
        const good = await runMemoryEval({ layers: ['extraction'], model: 'glm-5.3', client: scripted({ answer: { extraction: answering('good') } }).client, git: GIT, samples: 1 });
        const bad = await runMemoryEval({ layers: ['extraction'], model: 'glm-5.3', client: scripted({ answer: { extraction: answering('bad') } }).client, git: GIT, samples: 1 });
        const own = (report: MemoryReport) => scores(report.extraction!).filter((row) => row.check !== 'reads as an extraction');
        expect(own(good).filter((row) => row.pass !== 1).map((row) => `${row.scene}: ${row.check}`)).toEqual([]);
        expect(own(bad).filter((row) => row.pass !== 0).map((row) => `${row.scene}: ${row.check}`)).toEqual([]);
        expect(own(good).map((row) => row.check)).toEqual(
            expect.arrayContaining([
                'what happened: the rescue',
                'who knows it: only Sera Quill',
                'who knows it: only Bram Oakes',
                'fact or belief: the lie is Ilse’s Belief',
                'fact or belief: no Memory states the lie as true',
                'the change: the earlier Memory is changed, by its id',
            ]),
        );
        expect(own(good).every((row) => row.kind === 'code')).toBe(true);
        // The app writes {user} for the name itself when it stores a Memory, so the eval does not mark it.
        expect(own(good).filter((row) => row.check.includes('{user}'))).toEqual([]);
    });

    it('lets a Memory say the lie was told, so long as it does not say the lie happened', async () => {
        const told = operations({ op: 'believe', character: ILSE, text: '{user} burned her shed.', contradicts: null, cause: 'x' }, add('Bram Oakes told Ilse Varn that {user} set the fire in her shed; it was his own lantern.', [BRAM]));
        const report = await runMemoryEval({ layers: ['extraction'], model: 'glm-5.3', client: scripted({ answer: { extraction: (body) => (promptOf(body).includes('in the ash of her') ? told : '{"operations":[]}') } }).client, git: GIT, samples: 1 });
        const row = scores(report.extraction!).find((one) => one.scene === 'extract-lie' && one.check === 'fact or belief: no Memory states the lie as true')!;
        expect(`${row.pass}/${row.scored}`).toBe('1/1');
    });
});

describe('Layer 3, Use: with the Memory in the prompt, does the Character act on it', () => {
    const scene = (name: string) => USE_SCENES.find((one) => one.name === name)!;
    const built = (name: string) => buildTurnPrompt({ ...scene(name).input, userText: scene(name).userText }).messages.map((message) => message.content).join('\n');

    it('is fourteen scenes: for each anchor the Memory among the others, without it, alone, and among as many that are not hers; and an off-topic turn where the past has one', () => {
        expect(USE_SCENES.map((one) => one.name)).toEqual([
            'use-rescue-with',
            'use-rescue-without',
            'use-rescue-offtopic',
            'use-rescue-alone',
            'use-rescue-strangers',
            'use-report-with',
            'use-report-without',
            'use-report-offtopic',
            'use-report-alone',
            'use-report-strangers',
            'use-fire-with',
            'use-fire-without',
            'use-fire-alone',
            'use-fire-strangers',
        ]);
        expect(scenePromptProblems([...USE_SCENES, ...EXTRACTION_SCENES])).toEqual([]);
    });

    // The first runs asked Sera and Ilse for the one thing their cards forbid, and so measured the card. Each ask is now one the card leaves to her.
    it('asks each Character for a thing her card leans against and does not forbid, and judges the reply by how it ends', () => {
        const card = (name: string) => Object.values(MEMORY_CAST.find((character) => character.name === name)!).flat().join(' ');
        expect(scene('use-rescue-with').userText).toMatch(/lend him twelve crowns/);
        expect(card(SERA)).toContain('As a habit she does not lend money');
        expect(card(SERA)).not.toContain("shows it to no one");
        expect(scene('use-fire-with').userText).toMatch(/sit by her stove/);
        for (const name of ['rescue', 'report', 'fire']) expect(scene(`use-${name}-with`).graded[0].criterion).toContain('Judge by how the reply ends');
        // "Forty crowns" is the Memory's own, as much as "Vessin": the first runs' replies said the one and never the other.
        const report = ANCHORS.find((anchor) => anchor.name === 'report')!;
        expect(report.telltale.test('Forty crowns, that fine cost me.')).toBe(true);
    });

    it('holds the arms of an anchor to one difference: the Memory between "with" and "without", the user’s turn between "with" and "off topic"', () => {
        for (const [name, tells] of [['rescue', 'Marigold'], ['report', 'Vessin'], ['fire', 'Candle Night']] as const) {
            const withIt = built(`use-${name}-with`);
            const without = built(`use-${name}-without`);
            expect(withIt).toContain(tells);
            expect(without).not.toContain(tells);
            // Take the lines of the Memory (and, for the fire, of the Belief) out of "with", and what is left is "without".
            expect(withIt.split('\n').filter((line) => !line.includes(tells)).join('\n')).toBe(without);
        }
        // "Alone" is "with", less every other Memory: it tells a Memory lost in the crowd from one the card overrules.
        for (const name of ['rescue', 'report', 'fire']) {
            const withIt = scene(`use-${name}-with`);
            const alone = scene(`use-${name}-alone`);
            expect(alone.userText).toBe(withIt.userText);
            expect(alone.input.memories).toHaveLength(1);
            expect(alone.input.memories[0]).toEqual(withIt.input.memories[0]);
            expect({ ...alone.input, memories: [] }).toEqual({ ...withIt.input, memories: [] });
        }
        // "Strangers" is "with", its other Memories changed for as many that are not about her and that she does not know:
        // a crowd of the same size that says nothing of her and the user. It tells burial from a later past that speaks against the old one.
        for (const [name, first, full] of [['rescue', 'Sera', SERA], ['report', 'Bram', BRAM], ['fire', 'Ilse', ILSE]] as const) {
            const withIt = scene(`use-${name}-with`);
            const strangers = scene(`use-${name}-strangers`);
            expect(strangers.userText).toBe(withIt.userText);
            expect(strangers.input.memories[0]).toEqual(withIt.input.memories[0]);
            const crowd = strangers.input.memories.slice(1);
            expect(crowd.filter((memory) => memory.text.includes(first) || memory.knownBy.includes(full))).toEqual([]);
            expect(ANCHORS.filter((anchor) => crowd.some((memory) => anchor.telltale.test(memory.text)))).toEqual([]);
            const tokens = crowd.reduce((sum, memory) => sum + memoryCost(memory), 0);
            expect(tokens).toBeGreaterThan(3300);
            expect(tokens).toBeLessThanOrEqual(3500);
            expect({ ...strangers.input, memories: [] }).toEqual({ ...withIt.input, memories: [] });
            expect(built(`use-${name}-strangers`)).toContain(crowd.at(-1)!.text.replaceAll('{user}', CORIN));
        }
        for (const name of ['rescue', 'report']) {
            const withIt = scene(`use-${name}-with`);
            const offTopic = scene(`use-${name}-offtopic`);
            expect(offTopic.userText).not.toBe(withIt.userText);
            expect({ ...offTopic.input }).toEqual({ ...withIt.input });
        }
    });

    it('fills the budget beside the anchor with the newest Memories, none of them left out of the prompt and none holding an anchor’s own words', () => {
        const tokens = FILLER_MEMORIES.reduce((sum, memory) => sum + memoryCost(memory), 0);
        expect(tokens).toBeGreaterThan(3000);
        expect(tokens).toBeLessThanOrEqual(3500);
        const prompt = built('use-rescue-with');
        expect(prompt).toContain(FILLER_MEMORIES[0].text.replaceAll('{user}', CORIN));
        expect(prompt).toContain(FILLER_MEMORIES.at(-1)!.text.replaceAll('{user}', CORIN));
        for (const anchor of ANCHORS.filter((one) => ['rescue', 'report', 'fire'].includes(one.name))) {
            expect(FILLER_MEMORIES.filter((memory) => anchor.eventWords.test(memory.text)).map((memory) => memory.text)).toEqual([]);
        }
    });

    /** The play model's replies by scene, in the order they are asked for; the grader passes a reply that holds "GRANTS". */
    function playing(replies: Record<string, string[]>) {
        const asked: Record<string, number> = {};
        return scripted({
            answer: {
                play: (body) => {
                    const prompt = promptOf(body);
                    // The scene whose turn and whose Memories, all of them and no others, are in the prompt.
                    const lines = prompt.split('\n').filter((line) => line.startsWith('- [known by')).length;
                    const name = USE_SCENES.find(
                        (one) => prompt.includes(one.userText) && one.input.memories.length === lines && one.input.memories.every((memory) => prompt.includes(memory.text.replaceAll('{user}', CORIN))),
                    )!.name;
                    const index = asked[name] ?? 0;
                    asked[name] = index + 1;
                    return replies[name]?.[index] ?? `The room was quiet.\n\n@${USE_SCENES.find((one) => one.name === name)!.input.present![0]}: Not today.`;
                },
                grader: (body) => JSON.stringify({ checks: [{ name: 'behavioural impact', quote: 'the words', pass: promptOf(body).includes('GRANTS') }] }),
            },
        });
    }

    it('reports recall evidence and behavioural impact as two measures, with the four ways they can fall out, and impact as a difference from the same turn without the Memory', async () => {
        const router = playing({
            'use-rescue-with': [`@${SERA}: For Tobin and the Marigold. GRANTS.`, `@${SERA}: The Marigold was a long time ago. No.`],
            'use-rescue-without': [`@${SERA}: No.`, `@${SERA}: Just this once. GRANTS.`],
            'use-rescue-offtopic': [`@${SERA}: Four feet two.`, `@${SERA}: Four feet two, and I have not forgotten the Marigold.`],
            'use-rescue-alone': [`@${SERA}: For the Marigold. GRANTS.`, `@${SERA}: For Tobin. GRANTS.`],
            'use-rescue-strangers': [`@${SERA}: For the Marigold. GRANTS.`, `@${SERA}: No.`],
        });
        const report = await runMemoryEval({ layers: ['use'], model: 'glm-5.3', client: router.client, git: GIT, samples: 2 });

        expect(router.sent.filter((one) => one.role === 'play')).toHaveLength(28);
        expect(router.sent.filter((one) => one.role === 'play')[0].body.model).toBe('z-ai/glm-5.3');
        const rescue = report.use!.anchors.find((one) => one.anchor === 'rescue')!;
        expect(rescue).toEqual({
            anchor: 'rescue',
            samples: 2,
            recall: 2,
            impact: 1,
            both: 1,
            recallOnly: 1,
            impactOnly: 0,
            neither: 0,
            withoutSamples: 2,
            impactWithout: 1,
            inventedPast: 0,
            offTopicSamples: 2,
            broughtUpOffTopic: 1,
            aloneSamples: 2,
            recallAlone: 2,
            impactAlone: 2,
            strangersSamples: 2,
            recallStrangers: 1,
            impactStrangers: 1,
        });
        // The fire has no off-topic arm.
        expect(report.use!.anchors.find((one) => one.anchor === 'fire')).toMatchObject({ offTopicSamples: 0, broughtUpOffTopic: 0, recall: 0, impact: 0, neither: 2 });

        const card = formatMemoryScorecard(report);
        expect(card).toContain('| Anchor | Recall evidence | Behavioural impact | Both | Recall only | Impact only | Neither |');
        expect(card).toContain('| rescue | 2 of 2 | 1 of 2 | 1 | 1 | 0 | 0 |');
        expect(card).toContain('| rescue | 1 of 2 | 1 of 2 | 0 of 2 |');
        expect(card).toContain('| Anchor | Measure | Among the others | Among strangers | Alone | Without |');
        expect(card).toContain('| rescue | recall | 2 of 2 | 1 of 2 | 2 of 2 | - |');
        expect(card).toContain('| rescue | impact | 1 of 2 | 1 of 2 | 2 of 2 | 1 of 2 |');
    });

    it('fails Ilse for knowing of the lantern, which only Bram was ever told', async () => {
        const router = playing({ 'use-fire-with': [`@${ILSE}: I know about the lantern, and about Candle Night.`] });
        const report = await runMemoryEval({ layers: ['use'], model: 'glm-5.3', client: router.client, git: GIT, samples: 1 });
        const row = scores(report.use!.report).find((one) => one.scene === 'use-fire-with' && one.check === 'does not know what she was never told')!;
        expect(`${row.pass}/${row.scored}`).toBe('0/1');
    });
});

describe('Layer 4, Story so far: does an early event stay in the account as the story grows', () => {
    it('has the account written at five lengths by the app’s own prompt, each from every Message through that Chapter', async () => {
        const router = scripted();
        const report = await runMemoryEval({ layers: ['account'], model: 'glm-5.3', client: router.client, git: GIT, samples: 1 });
        const writers = router.sent.filter((one) => one.role === 'writer');
        expect(writers).toHaveLength(5);
        expect(writers[0].body).toMatchObject({ model: GRADER_MODEL, max_tokens: 2000 });
        expect(promptOf(writers[0].body)).toContain('chapter 6 in Harrowmere');
        expect(promptOf(writers[0].body)).not.toContain('chapter 7 in Harrowmere');
        expect(promptOf(writers[4].body)).toContain('chapter 30 in Harrowmere');
        expect(promptOf(writers[4].body)).toContain('[Story]\n');
        expect(report.account!.samples.map((sample) => sample.length)).toEqual([6, 12, 18, 24, 30]);
    });

    it('counts the major events by their telltales and the minor details apart, and asks about a changed item only at the lengths after its change', async () => {
        const account = 'Corin pulled Tobin from under the Marigold. Sera wears the lock key on a cord. Bram owns the Heron. Ilse has a cat called Pepper.';
        const router = scripted({ answer: { writer: () => account, grader: (body) => JSON.stringify({ checks: (promptOf(body).match(/^\d+\. "([^"]+)"/gm) ?? []).map((line) => ({ name: /"([^"]+)"/.exec(line)![1], quote: 'wears the lock key', pass: false })) }) } });
        const report = await runMemoryEval({ layers: ['account'], model: 'glm-5.3', client: router.client, git: GIT, samples: 1 });

        const at = (length: number) => report.account!.samples.find((sample) => sample.length === length)!;
        expect(at(6).mustStay).toEqual({ rescue: true, report: false, fire: false, promise: false });
        expect(at(6).minor).toEqual({ nettle: false, Wren: false, 'Miller’s Reel': false, Pepper: true });
        expect(at(6).changed).toEqual({ 'the lock key': 'too early', 'Bram’s boat': 'too early' });
        expect(at(12).changed).toEqual({ 'the lock key': 'too early', 'Bram’s boat': 'too early' });
        expect(at(18).changed).toEqual({ 'the lock key': 'fail', 'Bram’s boat': 'too early' });
        expect(at(24).changed).toEqual({ 'the lock key': 'fail', 'Bram’s boat': 'fail' });
        expect(at(30).changed).toEqual({ 'the lock key': 'fail', 'Bram’s boat': 'fail' });
        // One grader call for each account that has something to ask: at 18, 24 and 30.
        expect(router.sent.filter((one) => one.role === 'grader')).toHaveLength(3);
        expect(promptOf(router.sent.find((one) => one.role === 'grader')!.body)).toContain('who holds the silver lock key');

        const card = formatMemoryScorecard(report);
        expect(card).toContain('| Through Chapter | Words | rescue | report | fire | promise | Minor details kept | the lock key | Bram’s boat |');
        expect(card).toContain('| 18 | 25 | 1 of 1 | 0 of 1 | 0 of 1 | 0 of 1 | 1 of 4 | fail 1 | too early |');
    });

    it('counts an account that never speaks of a changed item as leaving it out, and asks the grader nothing about it', async () => {
        const router = scripted({ answer: { writer: () => 'Corin came to Harrowmere, surveyed the river and stayed for the building of the new lock.' } });
        const report = await runMemoryEval({ layers: ['account'], model: 'glm-5.3', client: router.client, git: GIT, samples: 1 });
        expect(report.account!.samples.find((sample) => sample.length === 30)!.changed).toEqual({ 'the lock key': 'left out', 'Bram’s boat': 'left out' });
        expect(router.sent.filter((one) => one.role === 'grader')).toEqual([]);
    });

    // Spec (story-so-far-length): as the app does since 2026-11-25, a cut-off answer is asked for once more, shorter.
    it('asks for a cut-off account once more as the app does, shorter, and says which accounts came from a second try', async () => {
        const router = scripted({ answer: { writer: (_body, index) => (index === 0 ? { text: 'Corin came to', completionTokens: 2000 } : 'Corin pulled Tobin from the Marigold.') } });
        const report = await runMemoryEval({ layers: ['account'], model: 'glm-5.3', client: router.client, git: GIT, samples: 1 });
        const writers = router.sent.filter((one) => one.role === 'writer');
        expect(writers).toHaveLength(6);
        expect(promptOf(writers[0].body)).not.toContain('at most 350 words');
        expect(promptOf(writers[1].body)).toContain('Your last account ran too long and was cut off');
        expect(promptOf(writers[1].body)).toContain('chapter 6 in Harrowmere');
        expect(report.account!.samples[0]).toMatchObject({ length: 6, error: null, text: 'Corin pulled Tobin from the Marigold.', secondTry: true });
        expect(report.account!.samples[1]).toMatchObject({ length: 12, error: null, secondTry: false });
        const card = formatMemoryScorecard(report);
        expect(card).toContain('First answers cut off at the cap: 1 of 5. Of those, a shorter second try was stored 1 time and was cut off again 0 times.');
        expect(card).toContain('Accounts from a shorter second try: 1, of 6 words on average; the four events kept: rescue 1 of 1, report 0 of 1, fire 0 of 1, promise 0 of 1.');
    });

    it('counts an account cut off twice as a failed update, apart from the rest', async () => {
        const router = scripted({ answer: { writer: (_body, index) => (index < 2 ? { text: 'Corin came to', completionTokens: 2000 } : 'Corin came to Harrowmere.') } });
        const report = await runMemoryEval({ layers: ['account'], model: 'glm-5.3', client: router.client, git: GIT, samples: 1 });
        expect(report.account!.samples[0]).toMatchObject({ length: 6, text: null, secondTry: true, error: 'The Story so far writer was cut off at its length cap.' });
        expect(report.account!.samples[1]).toMatchObject({ length: 12, error: null });
        expect(formatMemoryScorecard(report)).toContain('First answers cut off at the cap: 1 of 5. Of those, a shorter second try was stored 0 times and was cut off again 1 time.');
    });
});

describe('The memory eval’s gate, its grader cases and its report', () => {
    function start(env: Record<string, string | undefined>, router = scripted(), reportDir = tempDir()) {
        const lines: string[] = [];
        return { router, lines, reportDir, started: startMemoryEval(env, { fetch: router.fetchImpl, reportDir, log: (line) => lines.push(line), git: () => GIT }) };
    }

    it('refuses without the spend flag before any call, embeddings included, and says what each layer would send and cost', async () => {
        const { router, started } = start({ EVAL_MEMORY: 'yes', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' });
        await expect(started).rejects.toThrow(/spends OpenRouter credit\. Start it with --memory --spend\./);
        await expect(start({ EVAL_MEMORY: 'yes' }).started).rejects.toThrow(/choice: \d+ texts to embed.*extraction: 25 calls.*use: \d+ calls.*account: \d+ calls.*In all about \$\d\.\d{3}, at most \$\d\.\d{3}/s);
        expect(router.sent).toEqual([]);
    });

    it('refuses a layer it does not have, naming the four', async () => {
        await expect(start({ EVAL_MEMORY: 'yes', EVAL_SPEND: 'yes', EVAL_SCENES: 'recall', OPENROUTER_API_KEY: 'k' }).started).rejects.toThrow('Unknown layer "recall". Name one of choice, extraction, use, account, or none for all four.');
        await expect(start({ EVAL_MEMORY: 'yes', EVAL_SPEND: 'yes' }).started).rejects.toThrow('OPENROUTER_API_KEY is not set');
    });

    it('with the flag and the key, runs the named layers and writes the report and the scorecard under names of their own', async () => {
        const { started, reportDir, lines } = start({ EVAL_MEMORY: 'yes', EVAL_SPEND: 'yes', EVAL_SCENES: 'choice,account', EVAL_SAMPLES: '1', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' });
        const { report, json, scorecard } = await started;
        expect(report.choice).not.toBeNull();
        expect(report.account).not.toBeNull();
        expect(report.extraction).toBeNull();
        expect(report.use).toBeNull();
        expect(path.basename(json)).toMatch(/^memory-.*-glm-5\.3\.json$/);
        expect(existsSync(json) && existsSync(scorecard)).toBe(true);
        expect(readFileSync(json, 'utf8')).not.toContain('sk-or-test');
        const card = readFileSync(scorecard, 'utf8');
        expect(card).toContain('# Long-term memory eval: GLM-5.3');
        expect(card).toContain('Commit abc1234');
        expect(card).toContain('## Layer 1: Choice');
        expect(card).toContain('| Anchor | Cue | Sent | Why | Rank | Score | Tokens used | Unrelated by meaning |');
        expect(card).toContain('## Layer 4: Story so far');
        expect(card).not.toContain('## Layer 3');
        expect(lines.join('\n')).toContain('Long-term memory eval');
    });

    it('compares with the run before it when asked: each anchor’s place then and now', async () => {
        const reportDir = tempDir();
        const env = { EVAL_MEMORY: 'yes', EVAL_SPEND: 'yes', EVAL_SCENES: 'choice', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' };
        await start(env, scripted(), reportDir).started;
        const { scorecard } = await start({ ...env, EVAL_AGAINST: 'last' }, scripted(), reportDir).started;
        const card = readFileSync(scorecard, 'utf8');
        expect(card).toContain('Compared with the run of ');
        expect(card).toContain('| Anchor | Cue | Sent | Why | Rank | Score | Tokens used | Unrelated by meaning | Before |');
    });

    // The first two real runs lost cells to the host rate-limiting the play model past the client’s own retries, and filling them meant paying for the layer again.
    it('plays a failed call again, so a busy host does not leave a scene short', async () => {
        const router = scripted({ answer: { play: (_body, index) => (index < 2 ? { status: 500 } : `@${SERA}: Not the book.`) } });
        const report = await runMemoryEval({ layers: ['use'], scenes: ['use-rescue-with'], model: 'glm-5.3', client: router.client, git: GIT, samples: 2, retryDelayMs: 0 });
        const [scene] = report.use!.report.scenes;
        expect(report.use!.report.scenes).toHaveLength(1);
        expect(scene.samples.map((sample) => sample.text)).toEqual([`@${SERA}: Not the book.`, `@${SERA}: Not the book.`]);
        expect(report.use!.anchors.find((one) => one.anchor === 'rescue')).toMatchObject({ samples: 2 });
        // Every call, the failed ones too, is in the report, and what they cost is in the total.
        expect(report.use!.report.calls.filter((call) => call.role === 'play' && call.error !== null).length).toBeGreaterThanOrEqual(2);
    });

    it('gives up on a call that keeps failing, and says so in the sample', async () => {
        const router = scripted({ answer: { play: () => ({ status: 500 }) } });
        const report = await runMemoryEval({ layers: ['use'], scenes: ['use-rescue-with'], model: 'glm-5.3', client: router.client, git: GIT, samples: 1, retryDelayMs: 0 });
        expect(report.use!.report.scenes[0].samples[0]).toMatchObject({ text: null });
        expect(report.use!.report.scenes[0].samples[0].error).toContain('OpenRouter');
    });

    it('plays named scenes alone when they are named, with the layer they belong to', async () => {
        const { started, router } = start({ EVAL_MEMORY: 'yes', EVAL_SPEND: 'yes', EVAL_SCENES: 'use-rescue-with,use-fire-without', EVAL_SAMPLES: '1', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' });
        const { report } = await started;
        expect(report.use!.report.scenes.map((scene) => scene.name)).toEqual(['use-rescue-with', 'use-fire-without']);
        expect(report.choice).toBeNull();
        expect(report.extraction).toBeNull();
        expect(router.sent.filter((one) => one.role === 'play')).toHaveLength(2);
        await expect(start({ EVAL_MEMORY: 'yes', EVAL_SCENES: 'use-rescue-with' }).started).rejects.toThrow(/use: 10 calls/);
    });

    it('keeps its scenes out of the prompt eval run’s own list, so `all` never plays them', () => {
        const names = EVAL_SCENES.map((scene) => scene.name);
        expect([...USE_SCENES, ...EXTRACTION_SCENES].filter((scene) => names.includes(scene.name))).toEqual([]);
    });

    it('has, for every graded check of its own, a text the grader must pass and one it must fail, and the grader check reads them', () => {
        const graded = [...USE_SCENES.flatMap((scene) => scene.graded.map((check) => ({ scene: scene.name.replace(/-(?:without|alone|strangers)$/, '-with'), check: check.name }))), ...Object.values(CURRENT_STATE).map((check) => ({ scene: ACCOUNT_SCENE, check: check.name }))];
        for (const { scene, check } of graded) {
            for (const label of ['pass', 'fail'] as const) {
                expect(MEMORY_GRADER_CASES.some((one) => one.scene === scene && one.check === check && one.label === label), `${scene}, ${check}: a ${label} case`).toBe(true);
            }
        }
        expect(graderCaseProblems(MEMORY_GRADER_CASES)).toEqual([]);
        expect(GRADER_CASES).toEqual(expect.arrayContaining(MEMORY_GRADER_CASES));
    });
});

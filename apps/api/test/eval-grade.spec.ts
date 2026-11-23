import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { GRADER_CASES, GraderCase, startGraderCheck } from './live/eval-grade.js';
import { EvalReport } from './live/eval-run.js';
import { EVAL_SCENES } from './live/eval-scenes.js';

const GIT = { commit: 'abc1234', dirty: false };
const KEY = { EVAL_GRADE: 'yes', EVAL_SPEND: 'yes', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' };

/** A scripted OpenRouter that only ever plays the grader: `verdict` says pass or fail for each call. */
function scriptedGrader(verdict: (index: number, asked: string) => boolean | 'unreadable' = () => true, cost = 0.0001) {
    const asked: string[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
        const body = JSON.parse(String(init.body)) as { messages: { content: string }[]; response_format?: unknown; model: string };
        asked.push(body.messages.map((message) => message.content).join('\n'));
        const answer = verdict(asked.length - 1, asked.at(-1)!);
        const text = answer === 'unreadable' ? 'I think it is fine.' : JSON.stringify({ checks: [{ name: 'x', pass: answer, quote: 'the words judged' }] });
        const json = { id: `gen-${asked.length}`, choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20, cost } };
        return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    return { asked, fetchImpl };
}

function start(env: Record<string, string | undefined>, grader = scriptedGrader(), reportDir = mkdtempSync(path.join(tmpdir(), 'grade-'))) {
    const lines: string[] = [];
    return { grader, lines, reportDir, started: startGraderCheck(env, { fetch: grader.fetchImpl, reportDir, log: (line) => lines.push(line), git: () => GIT }) };
}

/** A file of hand-labelled replies, as the user hands one back. */
function labels(entries: unknown[]): string {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'labels-')), 'labels.json');
    writeFileSync(file, JSON.stringify(entries));
    return file;
}

/** The card's line for one graded check. */
const line = (card: string, check: string) => card.split('\n').find((one) => one.includes(`| ${check} |`));

// Spec (prompt-evals, "The grader check"): every answer here is scripted; nothing reaches OpenRouter.
describe('The grader check', () => {
    it('has, for every graded check of every scene, a reply labelled pass and a reply labelled fail', () => {
        const graded = EVAL_SCENES.flatMap((scene) => (scene.kind === 'turn' || scene.kind === 'chat' ? scene.graded.map((check) => check.name) : []));
        const without = [...new Set(graded)].filter((check) => !(['pass', 'fail'] as const).every((label) => GRADER_CASES.some((one) => one.check === check && one.label === label)));

        expect(without).toEqual([]);
    });

    it('refuses to start without the spend flag, before any call, and says what it would send and cost', async () => {
        const { grader, started } = start({ EVAL_GRADE: 'yes', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' });

        // Each of the cases asked twice.
        await expect(started).rejects.toThrow(`Start it with --spend. ${GRADER_CASES.length} cases would send ${GRADER_CASES.length * 2} calls`);
        expect(grader.asked).toEqual([]);
    });

    it('asks the grader about each case’s reply and its one check, as many times as told, and never calls a play model', async () => {
        const { grader, started } = start({ ...KEY, EVAL_SAMPLES: '3' });

        const { report } = await started;

        expect(grader.asked).toHaveLength(GRADER_CASES.length * 3);
        expect(report!.calls).toBe(GRADER_CASES.length * 3);
        const first = GRADER_CASES[0];
        expect(grader.asked[0]).toContain('You check one reply');
        expect(grader.asked[0]).toContain(first.reply);
        expect(grader.asked[0]).toContain(`1. "${first.check}"`);
        expect(grader.asked[0]).not.toContain('2. "');
    });

    it('says, check by check, how many cases the grader agreed with, and lists each one it did not with its label and the words it judged on', async () => {
        // A grader that passes everything agrees with the replies labelled pass, and misses every one labelled fail.
        const { started } = start(KEY);

        const { card } = await started;

        const text = readFileSync(card!, 'utf8');
        // sounds like Mira: four cases, one labelled pass.
        expect(line(text, 'sounds like Mira')).toBe('| voice | sounds like Mira | 4 | 1 of 4 | 3 | 0 | 0 | 0 |');
        expect(line(text, 'does not tell the secret')).toBe('| secret | does not tell the secret | 3 | 1 of 3 | 2 | 0 | 0 | 0 |');
        const misses = text.slice(text.indexOf('## Where the grader and the label differ'));
        expect(misses).toContain('- voice, sounds like Mira: labelled fail (One long, formal speech.); the grader said pass on "the words judged", then pass on "the words judged".');
        expect(misses).not.toContain('labelled pass');
    });

    it('a grader that agrees with every label leaves nothing to list', async () => {
        const byReply = new Map(GRADER_CASES.map((one) => [one.reply, one.label === 'pass']));
        const { started } = start(KEY, scriptedGrader((_index, asked) => [...byReply].find(([reply]) => asked.includes(reply))![1]));

        const text = readFileSync((await started).card!, 'utf8');

        expect(line(text, 'sounds like Mira')).toBe('| voice | sounds like Mira | 4 | 4 of 4 | 0 | 0 | 0 | 0 |');
        expect(text).not.toContain('## Where the grader and the label differ');
    });

    it('counts a case the grader answered both ways as unsteady, and never as agreed', async () => {
        const { started } = start(KEY, scriptedGrader((index) => index % 2 === 0));

        const text = readFileSync((await started).card!, 'utf8');

        expect(line(text, 'sounds like Mira')).toBe('| voice | sounds like Mira | 4 | 0 of 4 | 3 | 1 | 4 | 0 |');
    });

    it('an answer the grader gave unreadably is not graded: neither an agreement nor a miss', async () => {
        const { started } = start(KEY, scriptedGrader(() => 'unreadable'));

        const text = readFileSync((await started).card!, 'utf8');

        expect(line(text, 'sounds like Mira')).toBe('| voice | sounds like Mira | 4 | 0 of 0 | 0 | 0 | 0 | 4 |');
    });

    describe('hand-labelled replies', () => {
        const mine: GraderCase = { scene: 'voice', check: 'sounds like Mira', label: 'fail', reply: '@Mira Vance: Indeed, I am most grateful to you.' };

        it('adds the labelled replies of a named file to the cases, and leaves out an entry not yet labelled', async () => {
            const file = labels([mine, { ...mine, label: null, reply: '@Mira Vance: Not yet read.' }]);
            const { grader, started } = start({ ...KEY, EVAL_LABELS: file, EVAL_SAMPLES: '1' });

            const { card } = await started;

            expect(grader.asked).toHaveLength(GRADER_CASES.length + 1);
            expect(grader.asked.at(-1)).toContain(mine.reply);
            expect(line(readFileSync(card!, 'utf8'), 'sounds like Mira')).toContain('| 5 |');
        });

        it('a reply about a Character’s speech with no speech line of theirs is not graded, and sends no call', async () => {
            const file = labels([{ ...mine, reply: 'Mira said nothing at all.' }]);
            const { grader, started } = start({ ...KEY, EVAL_LABELS: file, EVAL_SAMPLES: '1' });

            const { card } = await started;

            expect(grader.asked).toHaveLength(GRADER_CASES.length);
            expect(line(readFileSync(card!, 'utf8'), 'sounds like Mira')).toMatch(/\| 5 \| 1 of 4 \| 3 \| 0 \| 0 \| 1 \|$/);
        });

        it('refuses, before any call, a file that is not there and a case naming a scene or a check the eval does not have', async () => {
            await expect(start({ ...KEY, EVAL_LABELS: path.join(tmpdir(), 'no-such-labels.json') }).started).rejects.toThrow('No labels at');
            const unknown = start({ ...KEY, EVAL_LABELS: labels([{ ...mine, check: 'is lovely' }, { ...mine, scene: 'nowhere' }]) });
            await expect(unknown.started).rejects.toThrow('Scene "voice" has no graded check "is lovely".\nUnknown scene "nowhere" in a grader case.');
            expect(unknown.grader.asked).toEqual([]);
        });
    });

    it('stops before a call that could take the total past the cap, and says so', async () => {
        // At $0.2 a call the third call could pass the $0.50 cap.
        const { grader, started } = start(KEY, scriptedGrader(() => true, 0.2));

        const { report, card } = await started;

        expect(grader.asked).toHaveLength(3);
        expect(report!.stoppedAtCap).toBe(true);
        expect(readFileSync(card!, 'utf8')).toContain('stopped at the cap');
    });

    it('writes its report apart from the runs’ reports, with no key in it', async () => {
        const { reportDir, started } = start(KEY);

        const { card } = await started;

        expect(path.basename(card!)).toMatch(/^grade-\d{4}-\d{2}-\d{2}T[\d-]+Z\.md$/);
        expect(path.dirname(card!)).toBe(reportDir);
        expect(readFileSync(card!, 'utf8') + readFileSync(card!.replace(/\.md$/, '.json'), 'utf8')).not.toContain('sk-or-test');
    });

    it('writes a sheet to label from the saved runs: each reply a graded check read, once, with no label and no verdict of the grader’s, and spends nothing', async () => {
        const reportDir = mkdtempSync(path.join(tmpdir(), 'grade-'));
        const reply = '@Mira Vance: Too much? Tragic.';
        const sample = { text: reply, error: null, results: [{ check: 'Mira Vance speaks', kind: 'code', outcome: 'pass', reason: '1 speech lines' }, { check: 'sounds like Mira', kind: 'graded', outcome: 'fail', reason: 'Too much?' }] };
        const saved = { startedAt: '2026-11-22T00:00:00.000Z', scenes: [{ name: 'voice', about: '', kind: 'turn', samples: [sample, sample, { text: null, error: 'x', results: [] }] }], calls: [] } as unknown as EvalReport;
        writeFileSync(path.join(reportDir, 'eval-2026-11-22T00-00-00-000Z-glm-5.3.json'), JSON.stringify(saved));

        const { grader, lines, started } = start({ EVAL_GRADE: 'sheet' }, scriptedGrader(), reportDir);
        const { sheet } = await started;

        expect(grader.asked).toEqual([]);
        const written = JSON.parse(readFileSync(sheet!, 'utf8'));
        expect(written).toEqual([{ scene: 'voice', check: 'sounds like Mira', criterion: expect.stringContaining('short and teasing'), label: null, reply }]);
        expect(lines.join('\n')).toContain('1 replies to label');
    });
});

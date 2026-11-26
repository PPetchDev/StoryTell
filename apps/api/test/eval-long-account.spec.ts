import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { exportChats, exportSql, parseExport } from '../../../scripts/export-chat.mjs';
import { STORY_SO_FAR_SHORTER_WORDS, storySoFarPromptMessages } from '../src/manager/chat/story-so-far/story-so-far-prompt.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { OpenRouterClient } from '../src/service/model-gateway/real/openrouter-client.js';
import {
    ARM_ASK,
    armPrompt,
    armsAsked,
    checkAccount,
    ExportedChat,
    firstPersonWords,
    formatLongAccountScorecard,
    LongAccountPlan,
    openingOf,
    planProblems,
    runLongAccount,
    startLongAccountEval,
    writerInputFrom,
} from './live/eval-long-account.js';
import { EvalRunRefused } from './live/eval-run.js';

/**
 * The long-input account eval (.scratch/story-so-far-start/spec.md, "Plan: a long-input eval"),
 * on a made-up Chat and scripted answers: nothing reaches the network or the VM.
 */

const GIT = { commit: 'abc1234', dirty: false };

/** A made-up copy of a Chat, as the export writes it: Messages out of order, reply parts out of order. */
function madeUpChat(length = 40): ExportedChat {
    const messages = Array.from({ length }, (_, position) =>
        position % 2 === 0
            ? { position, kind: 'ai', text: null, identityName: null, parts: [
                  { position: 1, kind: 'speech', speakerName: 'Ines', text: `Line ${position}.` },
                  { position: 0, kind: 'narration', speakerName: null, text: position === 0 ? 'Torches moved beyond the broken pillar.' : `The night went on, beat ${position}.` },
              ] }
            : { position, kind: 'user', text: `Rin acts, turn ${position}.`, identityName: position === 1 ? null : 'Rin', parts: [] },
    );
    return { chatId: 4, personaName: null, roleName: 'The fox', castNames: ['Ines', 'Odile'], storySoFarThrough: length - 3, messages: messages.reverse() };
}

const PLAN: LongAccountPlan = {
    inputs: [
        {
            name: 'chat-4-20',
            chat: 4,
            through: 20,
            start: 'pillar|torch',
            quarters: ['pillar', 'beat 8', 'beat 12', 'beat 18'],
            startExamples: { good: ['Rin hid behind the broken pillar. The torches passed.'], bad: ['Rin slept in the herb garden. Odile sang.'] },
        },
    ],
};
const EXAMPLES = PLAN.inputs[0].startExamples;

type Answer = string | { text: string; completionTokens: number } | { status: number };

function scripted(answer: (body: Record<string, any>, index: number) => Answer) {
    const sent: Record<string, any>[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
        sent.push(body);
        const reply = answer(body, sent.length - 1);
        if (typeof reply === 'object' && 'status' in reply) return new Response(JSON.stringify({ error: { message: 'Provider returned error', code: reply.status } }), { status: reply.status });
        const text = typeof reply === 'string' ? reply : reply.text;
        const completionTokens = typeof reply === 'string' ? 120 : reply.completionTokens;
        const json = { id: `gen-${sent.length}`, choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: completionTokens, cost: 0.001 } };
        return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    return { sent, fetchImpl, client: new OpenRouterClient('sk-or-test-not-a-real-key', fetchImpl, async () => {}) };
}

const lastAsk = (body: Record<string, any>): string => body.messages[1].content;

describe('The copy of a live Chat', () => {
    it('is told to the writer as the app tells it: in order, the user under the name they wrote as, a reply as Story with its parts in order', () => {
        const input = writerInputFrom(madeUpChat(4));
        expect(input.identityName).toBe('Rin');
        expect(input.castNames).toEqual(['Ines', 'Odile']);
        expect(input.messages).toEqual([
            { speaker: 'Story', text: 'Torches moved beyond the broken pillar.\n\n@Ines: Line 0.' },
            { speaker: 'Rin', text: 'Rin acts, turn 1.' },
            { speaker: 'Story', text: 'The night went on, beat 2.\n\n@Ines: Line 2.' },
            { speaker: 'Rin', text: 'Rin acts, turn 3.' },
        ]);
    });

    it('wears the Persona before any stamped name, and the Role only when nothing else names the user', () => {
        expect(writerInputFrom({ ...madeUpChat(4), personaName: 'Petch' }).identityName).toBe('Petch');
        const unstamped = madeUpChat(4);
        unstamped.messages = unstamped.messages.map((message) => ({ ...message, identityName: null }));
        expect(writerInputFrom(unstamped).identityName).toBe('The fox');
    });
});

describe('The export script', () => {
    it('sends one read-only SELECT per Chat and refuses anything that is not a Chat id', () => {
        const sql = exportSql(4);
        expect(sql.startsWith('BEGIN READ ONLY;')).toBe(true);
        expect(sql.trim().endsWith('ROLLBACK;')).toBe(true);
        expect(sql).toContain('WHERE c.id = 4;');
        expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|COPY)\b/i);
        expect(() => exportSql(Number('4; DROP TABLE chat'))).toThrow();
        expect(() => exportSql(0)).toThrow();
    });

    it('takes the JSON line from psql around BEGIN and ROLLBACK, and refuses an empty answer or another Chat', () => {
        const chat = madeUpChat(4);
        expect(parseExport(`BEGIN\n${JSON.stringify(chat)}\nROLLBACK\n`, 4).messages).toHaveLength(4);
        expect(() => parseExport('BEGIN\n\nROLLBACK\n', 4)).toThrow('no copy');
        expect(() => parseExport(`BEGIN\n${JSON.stringify(chat)}\nROLLBACK\n`, 3)).toThrow('not of that Chat');
    });

    it('saves each copy as chat-<id>.json and prints only the counts', () => {
        const written: Record<string, string> = {};
        const logged: string[] = [];
        exportChats([4], {
            read: (sql) => `BEGIN\n${JSON.stringify({ ...madeUpChat(6), chatId: Number(/c\.id = (\d+)/.exec(sql)![1]) })}\nROLLBACK\n`,
            write: (name, text) => (written[name] = text),
            log: (line) => logged.push(line),
        });
        expect(Object.keys(written)).toEqual(['chat-4.json']);
        expect(JSON.parse(written['chat-4.json']).messages).toHaveLength(6);
        expect(logged).toEqual(['Chat 4: 6 Messages, 6 reply parts, 2 Characters, saved as chat-4.json.']);
        expect(logged.join(' ')).not.toContain('Rin acts');
    });
});

describe('The plan', () => {
    it('names every problem before anything is sent: a missing copy, a cut past the end, a bad pattern, too few quarters', () => {
        const chats = new Map([[4, madeUpChat(40)]]);
        expect(planProblems(PLAN, chats)).toEqual([]);
        const bad: LongAccountPlan = {
            inputs: [
                { name: 'a', chat: 9, start: 'x', quarters: ['a', 'b', 'c', 'd'], startExamples: { good: ['x marks it.'], bad: ['y.'] } },
                { name: 'b', chat: 4, through: 41, start: '(', quarters: ['a', 'b', 'c'] as any, startExamples: EXAMPLES },
            ],
        };
        expect(planProblems(bad, chats)).toEqual([
            'a: no copy of Chat 9. Export it first (scripts/export-chat.mjs).',
            'b: "through" is 41, but Chat 4 has 40 Messages.',
            'b: "quarters" needs four patterns.',
            'b: "(" is not a pattern.',
        ]);
    });

    it('refuses a pattern holding a control character: "\\b" written once in JSON is a backspace, which matches nothing', () => {
        const chats = new Map([[4, madeUpChat(40)]]);
        const plan: LongAccountPlan = JSON.parse('{"inputs":[{"name":"x","chat":4,"start":"pillar","quarters":["\\binn\\b","b","c","d"],"startExamples":{"good":["By the pillar."],"bad":["In the garden."]}}]}');
        expect(planProblems(plan, chats)).toEqual([`x: "${String.fromCharCode(8)}inn${String.fromCharCode(8)}" is not a pattern.`]);
        const right: LongAccountPlan = JSON.parse('{"inputs":[{"name":"x","chat":4,"start":"pillar","quarters":["\\\\binn\\\\b","b","c","d"],"startExamples":{"good":["By the pillar."],"bad":["In the garden."]}}]}');
        expect(planProblems(right, chats)).toEqual([]);
    });

    // Observation 0005: a check shown only to fire on failures had not been shown to stay quiet on successes.
    it('refuses a start pattern that has not been shown to tell a good opening from a bad one, in the words accounts used', () => {
        const chats = new Map([[4, madeUpChat(40)]]);
        const withStart = (start: string, startExamples: any): LongAccountPlan => ({ inputs: [{ ...PLAN.inputs[0], start, startExamples }] });
        expect(planProblems(withStart('pillar', undefined), chats)).toEqual(['chat-4-20: "startExamples" needs at least one good and one bad opening, judged by hand.']);
        expect(planProblems(withStart('pillar', { good: ['By the pillar.'], bad: [] }), chats)).toEqual(['chat-4-20: "startExamples" needs at least one good and one bad opening, judged by hand.']);
        // The source said hounds; the account said shadow-wolves.
        expect(planProblems(withStart('pillar|hound', { good: ['Shadow-wolves attacked Ines in the Moonwood. Rin drove them off.'], bad: ['Rin slept in the herb garden.'] }), chats)).toEqual([
            'chat-4-20: the start pattern misses a good opening: "Shadow-wolves attacked Ines in the Moonwood. Rin drove them off."',
        ]);
        // Only the first two sentences count: a bad opening that names the start later is still bad, and a pattern too wide is refused.
        expect(planProblems(withStart('Rin', { good: ['Rin hid by the pillar.'], bad: ['Rin slept in the herb garden.'] }), chats)).toEqual(['chat-4-20: the start pattern passes a bad opening: "Rin slept in the herb garden."']);
    });
});

describe('The arms', () => {
    const input = writerInputFrom(madeUpChat(8));

    it('"now" is the app\'s own prompt, word for word', () => {
        expect(armPrompt(input, 'now')).toEqual(storySoFarPromptMessages({ ...input, corrections: null, ranLong: false }));
    });

    it('the other arms change only the last line of the first try; the second try is the app\'s in every arm', () => {
        const now = armPrompt(input, 'now');
        for (const arm of ['before', 'c', 'd'] as const) {
            const prompt = armPrompt(input, arm);
            expect(prompt[0]).toEqual(now[0]);
            expect(prompt[1].content).toBe(`${now[1].content.slice(0, -ARM_ASK.now.length)}${ARM_ASK[arm]}`);
            expect(armPrompt(input, arm, true)).toEqual(armPrompt(input, 'now', true));
        }
        // D was chosen (2026-11-26): the app's own ask is now D's, and "before" keeps the old one to measure against.
        expect(ARM_ASK.now).toBe(ARM_ASK.d);
        expect(ARM_ASK.before).toBe('Write the account now.');
    });

    it('are named after account-long; "now" alone when none is', () => {
        expect(armsAsked(['account-long'])).toEqual(['now']);
        expect(armsAsked(['account-long', 'd', 'c', 'before'])).toEqual(['before', 'c', 'd']);
        expect(() => armsAsked(['account-long', 'e'])).toThrow(EvalRunRefused);
    });
});

describe('The checks', () => {
    const input = PLAN.inputs[0];

    it('look for the start in the first two sentences only', () => {
        expect(openingOf('Rin hid behind the broken pillar. Torches passed. Then morning came.')).toBe('Rin hid behind the broken pillar. Torches passed.');
        expect(checkAccount(input, 'Rin hid behind the broken pillar. The torches passed.').opensAtStart).toBe(true);
        // A late scene first, the start only further on: that is the live failure.
        expect(checkAccount(input, 'Rin slept in the herb garden. Odile sang. Long before, she hid by a pillar.').opensAtStart).toBe(false);
    });

    it('count the quarters told, so a long account that skips the start still shows it', () => {
        expect(checkAccount(input, 'By the pillar. Then beat 8, beat 12 and beat 18.').quarters).toEqual([true, true, true, true]);
        expect(checkAccount(input, 'Beat 12 came, and beat 18.').quarters).toEqual([false, false, true, true]);
    });

    it('count first-person words outside quotation marks only', () => {
        expect(firstPersonWords('Nara sits beside me on the bench; my hand rests on hers.')).toBe(2);
        expect(firstPersonWords('Rin said "I will stay, my lady" and “we go now”.')).toBe(0);
        expect(firstPersonWords('Rin waited. Ines watched.')).toBe(0);
    });
});

describe('The run', () => {
    const chats = () => new Map([[4, madeUpChat(40)]]);

    it('writes each input and arm the asked number of times, keeps each account whole, and checks it', async () => {
        const router = scripted((body) => (lastAsk(body).endsWith(ARM_ASK.before) ? 'Rin slept in the herb garden. Beat 18 passed.' : 'Rin hid behind the broken pillar from the torches. Beat 8, beat 12 and beat 18 followed.'));
        const report = await runLongAccount({ plan: PLAN, chats: chats(), arms: ['before', 'c'], samples: 2, client: router.client, git: GIT });
        expect(router.sent).toHaveLength(4);
        expect(router.sent.every((body) => body.max_tokens === 2000)).toBe(true);
        expect(report.inputs).toEqual([{ name: 'chat-4-20', messages: 20, tokens: expect.any(Number) }]);
        // The cut: the twentieth Message is the last one sent, the twenty-first is not.
        expect(lastAsk(router.sent[0])).toContain('Rin acts, turn 19.');
        expect(lastAsk(router.sent[0])).not.toContain('beat 20');
        const [now, c] = [report.results.filter((one) => one.arm === 'before'), report.results.filter((one) => one.arm === 'c')];
        expect(now.map((one) => [one.opensAtStart, one.quarters.filter(Boolean).length])).toEqual([[false, 1], [false, 1]]);
        expect(c.map((one) => [one.opensAtStart, one.quarters.filter(Boolean).length])).toEqual([[true, 4], [true, 4]]);
        expect(report.totalUsd).toBeCloseTo(0.004);
        const card = formatLongAccountScorecard(report);
        expect(card).toContain('| chat-4-20 | 20 |');
        expect(card).toContain('| before | 2 of 2 | 0 of 2 | 1.0 | 0 of 2 |');
        expect(card).toContain('| c | 2 of 2 | 2 of 2 | 4.0 | 0 of 2 |');
    });

    it('keeps the whole account, so it can be scored again for free', async () => {
        const long = `Rin hid by the pillar. ${'More happened. '.repeat(60)}`;
        const report = await runLongAccount({ plan: PLAN, chats: chats(), arms: ['now'], samples: 1, client: scripted(() => long).client, git: GIT });
        expect(report.results[0].text).toBe(long.trim());
        expect(report.results[0].words).toBeGreaterThan(100);
    });

    it('asks a cut-off answer once more, shorter, as the app does, and counts one cut off twice as not stored', async () => {
        const router = scripted((_body, index) => (index === 0 ? { text: 'Rin hid', completionTokens: 2000 } : index === 1 ? 'Rin hid by the pillar.' : { text: 'cut', completionTokens: 2000 }));
        const report = await runLongAccount({ plan: PLAN, chats: chats(), arms: ['now'], samples: 2, client: router.client, git: GIT });
        expect(lastAsk(router.sent[1])).toContain(`at most ${STORY_SO_FAR_SHORTER_WORDS} words`);
        expect(report.results[0]).toMatchObject({ secondTry: true, text: 'Rin hid by the pillar.', opensAtStart: true });
        expect(report.results[1]).toMatchObject({ secondTry: true, text: null, error: 'The Story so far writer was cut off at its length cap.' });
        expect(formatLongAccountScorecard(report)).toContain('- chat-4-20, now: The Story so far writer was cut off at its length cap.');
    });

    it('stops before a call that could pass the cap', async () => {
        const router = scripted(() => 'Rin hid by the pillar.');
        const report = await runLongAccount({ plan: PLAN, chats: chats(), arms: ['now'], samples: 3, client: router.client, git: GIT, capUsd: 0.0045 });
        expect(router.sent.length).toBeLessThan(3);
        expect(report.stoppedAtCap).toBe(true);
    });

    it('refuses a bad plan before sending anything', async () => {
        const router = scripted(() => 'x');
        await expect(runLongAccount({ plan: { inputs: [{ ...PLAN.inputs[0], chat: 7 }] }, chats: chats(), arms: ['now'], samples: 1, client: router.client, git: GIT })).rejects.toThrow(EvalRunRefused);
        expect(router.sent).toHaveLength(0);
    });
});

describe('The gate', () => {
    function inputDir(plan: LongAccountPlan | null = PLAN): string {
        const dir = mkdtempSync(path.join(tmpdir(), 'long-account-'));
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, 'chat-4.json'), JSON.stringify(madeUpChat(40)));
        if (plan) writeFileSync(path.join(dir, 'long-account.json'), JSON.stringify(plan));
        return dir;
    }

    it('without the spend flag sends nothing and says what the run would send and cost', async () => {
        const router = scripted(() => 'x');
        const run = startLongAccountEval({ EVAL_SCENES: 'account-long,c,d' }, { fetch: router.fetchImpl, reportDir: inputDir(), inputDir: inputDir(), log: () => {} });
        await expect(run).rejects.toThrow(/Start it with --memory account-long --spend\. 1 inputs, arms c, d, 3 samples: 6 calls/);
        expect(router.sent).toHaveLength(0);
    });

    it('refuses with the plan missing, or with no key, before any call', async () => {
        const router = scripted(() => 'x');
        await expect(startLongAccountEval({ EVAL_SCENES: 'account-long', EVAL_SPEND: 'yes' }, { fetch: router.fetchImpl, reportDir: inputDir(), inputDir: inputDir(null), log: () => {} })).rejects.toThrow(/No plan at/);
        await expect(startLongAccountEval({ EVAL_SCENES: 'account-long', EVAL_SPEND: 'yes' }, { fetch: router.fetchImpl, reportDir: inputDir(), inputDir: inputDir(), log: () => {} })).rejects.toThrow(/OPENROUTER_API_KEY/);
        expect(router.sent).toHaveLength(0);
    });

    it('scores a saved report again by the plan as it is now, sending nothing', async () => {
        const router = scripted(() => 'x');
        const reportDir = inputDir();
        const saved = await runLongAccount({ plan: PLAN, chats: new Map([[4, madeUpChat(40)]]), arms: ['now'], samples: 1, client: scripted(() => 'Shadow-wolves attacked Ines. Rin drove them off. Then beat 8.').client, git: GIT });
        expect(saved.results[0].opensAtStart).toBe(false);
        writeFileSync(path.join(reportDir, 'long-account-2026-11-26T00-00-00-000Z.json'), JSON.stringify(saved));
        const wider: LongAccountPlan = { inputs: [{ ...PLAN.inputs[0], start: 'pillar|torch|wolves', startExamples: { good: [...EXAMPLES.good, 'Shadow-wolves attacked Ines.'], bad: EXAMPLES.bad } }] };
        const dir = inputDir(wider);
        const { report, json } = await startLongAccountEval({ EVAL_SCENES: 'account-long', EVAL_RESCORE: 'last' }, { fetch: router.fetchImpl, reportDir, inputDir: dir, log: () => {} });
        expect(report.results[0]).toMatchObject({ opensAtStart: true, quarters: [false, true, false, false] });
        expect(path.basename(json)).toBe('long-account-2026-11-26T00-00-00-000Z-rescored.json');
        expect(router.sent).toHaveLength(0);
    });

    it('with the flag and a key runs and saves the report and scorecard under long-account-, never the Messages', async () => {
        const router = scripted(() => 'Rin hid by the pillar.');
        const reportDir = inputDir();
        const { report, json } = await startLongAccountEval(
            { EVAL_SCENES: 'account-long', EVAL_SPEND: 'yes', EVAL_SAMPLES: '1', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' },
            { fetch: router.fetchImpl, reportDir, inputDir: inputDir(), log: () => {}, git: () => GIT },
        );
        expect(path.basename(json)).toMatch(/^long-account-.*\.json$/);
        expect(report.results).toHaveLength(1);
        expect(JSON.stringify(report)).not.toContain('Rin acts');
    });
});

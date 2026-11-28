import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

import { judgeFactsSection } from '../../src/manager/chat/details/facts.js';
import { judgePressingSection } from '../../src/manager/chat/details/pressing.js';
import { buildJudgePrompt, parseJudgement } from '../../src/manager/chat/judge/judge-prompt.js';
import { backgroundSamplers, TEXT_MODELS } from '../../src/service/model-gateway/real/model-table.js';
import { NanoGptTextClient } from '../../src/service/model-gateway/real/nanogpt-text-client.js';
import { DEFAULT_EVAL_DIR } from './eval-run.js';
import type { JudgeInput } from './eval-scenes.js';
import { REPO_ROOT } from './smoke-run.js';

/**
 * Scene move-on by a decision model (.scratch/scene-decisions/spec.md, "The eval"): synthetic cases
 * with a known answer, each asked of the Judge as it is (its real prompt and parser, on NanoGPT) and
 * of each decision model on NanoGPT, five times. Spends only NanoGPT's Weekly allowance.
 *
 *   npx vitest run --config vitest.live.config.ts test/live/scene-decision.live.ts
 */

const MIRA = 'Mira Vance';
const SAMPLES = Number(process.env.DECISION_SAMPLES || 5);
const DECISION_MODELS = (process.env.DECISION_MODELS || 'typesafe/jev-1.14,perplexity/pplx-decider-v1.2,liquid/d1,jaredpalmer/kev-9b').split(',');

const base: JudgeInput = {
    cast: [{ name: MIRA, personality: 'Dry humour, direct about what she wants, warm once she trusts someone.', arcDirection: '' }],
    identityName: 'Ash',
    bonds: [
        {
            fromName: MIRA,
            toName: null,
            label: 'curious warmth',
            description: 'She likes Ash and is waiting to see whether he will ask.',
            levels: { trust: 1, affection: 1, desire: 1, tension: 0 },
        },
    ],
    arcs: [{ name: MIRA, steps: [] }],
    scene: null,
    timeOfDay: 'evening',
    recent: ['Ash: Ash knocks on the bookshop door after closing.', `Mira let him in and locked the door behind him.\n\n@${MIRA}: You came back. I was hoping you would.`],
    userText: null,
    aiText: '',
    factsSection: judgeFactsSection([]),
    pressingSection: judgePressingSection(),
};

const ASKING_OUT = { name: 'After closing', situation: 'Ash has come to the bookshop after closing, meaning to ask Mira out.', moveOnCondition: 'The user asks Mira out to dinner' };
const LEAVING = {
    name: 'The last stocktake',
    situation: 'Mira has signed a lease in Lisbon and has not told Ash yet.',
    moveOnCondition: 'Mira tells Ash she is leaving in spring and gives him the key to the shop',
};

interface Case {
    name: string;
    scene: typeof ASKING_OUT;
    userText: string;
    aiText: string;
    met: boolean;
    /** Set on cases read from a file (DECISION_CASES); the built-in ones use the bookshop base. */
    userName?: string;
    cast?: { name: string; personality: string }[];
    recent?: string[];
}

const CASES: Case[] = [
    { name: 'asks', scene: ASKING_OUT, met: true, userText: 'Ash puts the book down, looks at Mira and asks her to have dinner with him on Friday.', aiText: `Mira did not make him wait for it.\n\n@${MIRA}: Friday. Yes. I thought you would never ask.` },
    { name: 'promises', scene: ASKING_OUT, met: false, userText: 'Ash turns a book over in his hands and says there is something he means to ask her, but not tonight. Tomorrow, maybe.', aiText: `Mira took the book from him and set it back on the shelf.\n\n@${MIRA}: Tomorrow, then. I will try to look surprised.` },
    { name: 'other words', scene: ASKING_OUT, met: true, userText: 'Ash asks whether she would let him buy her supper at the harbour place this weekend, just the two of them.', aiText: `Mira's eyebrows went up.\n\n@${MIRA}: Just the two of us. Saturday, then. Don't be late.` },
    { name: 'wrong person', scene: ASKING_OUT, met: false, userText: 'Ash says the shop looks good with the new shelves.', aiText: `Mira leaned on the counter.\n\n@${MIRA}: You know what, Ash? Have dinner with me on Friday. My treat. I'm tired of waiting for you to ask.` },
    { name: 'refuses', scene: ASKING_OUT, met: false, userText: 'Ash says he came to ask her something, but he has decided he will not ask her out. They are better as friends.', aiText: `Mira kept her face very still.\n\n@${MIRA}: Friends. Right. Of course.` },
    { name: 'imagined', scene: ASKING_OUT, met: false, userText: 'Ash pictures himself asking her to dinner, rehearses the words in his head, and says nothing at all.', aiText: `Mira glanced up from the till.\n\n@${MIRA}: You've been standing there a full minute. Need a book?` },
    { name: 'thai', scene: ASKING_OUT, met: true, userText: 'Ash มองหน้า Mira แล้วถามว่าคืนวันศุกร์นี้ไปกินข้าวเย็นด้วยกันไหม', aiText: `Mira smiled slowly.\n\n@${MIRA}: Friday dinner? I'd like that.` },
    { name: 'asked, declined', scene: ASKING_OUT, met: true, userText: 'Ash finally asks Mira out to dinner on Friday.', aiText: `Mira winced.\n\n@${MIRA}: Ash, I can't. Not Friday, not like that. I'm sorry.` },
    { name: 'a note', scene: ASKING_OUT, met: true, userText: 'Ash slides a folded note across the counter. It says: Dinner with me, Friday at eight?', aiText: `Mira read it twice and folded it into her pocket.\n\n@${MIRA}: Eight is fine.` },
    { name: 'joke', scene: ASKING_OUT, met: false, userText: 'Ash laughs and says: "Dinner? With you? You would eat all my chips." He goes back to stacking books.', aiText: `@${MIRA}: I would, and I'd enjoy it.` },
    { name: 'half of two', scene: LEAVING, met: false, userText: 'Ash asks why she has been so quiet all evening.', aiText: `Mira put the ledger down.\n\n@${MIRA}: Because I'm leaving in spring, Ash. Lisbon. I signed the lease last week.` },
    { name: 'both of two', scene: LEAVING, met: true, userText: 'Ash asks why she has been so quiet all evening.', aiText: `Mira put the ledger down and pressed the shop key into his hand.\n\n@${MIRA}: I'm leaving in spring. Lisbon. Somebody has to keep this place open, and I want it to be you.` },
];

const QUESTION = {
    type: 'noul',
    instructions:
        'Has the Scene\'s move-on condition fully happened in the story by the end of the latest exchange? It counts when it has happened in substance, in any words or order. A promise, a plan, an imagined or refused act, the wrong person doing it, or only part of the condition does not count. When in doubt, it has not.',
    criteria: { true: 'The whole condition has happened in the story.', false: 'It has not fully happened yet.' },
};

/** Question variants, tuned on the built-in cases before the blind ones are run. */
const VARIANTS: Record<string, { questions: Record<string, unknown>; met: (answers: Record<string, { noul?: number; probabilities?: Record<string, number> }>) => number }> = {
    rules: { questions: { met: QUESTION }, met: (a) => a.met?.noul ?? NaN },
    plain: {
        questions: {
            met: { type: 'noul', instructions: "Has this Scene's move-on condition happened in the story by the end of the latest exchange?", criteria: { true: 'It has happened.', false: 'It has not happened.' } },
        },
        met: (a) => a.met?.noul ?? NaN,
    },
    choice: {
        questions: {
            status: {
                type: 'choice',
                instructions: "Where does the Scene's move-on condition stand at the end of the latest exchange?",
                criteria: {
                    happened: 'The whole condition has actually happened in the story, done by the person it names, in any words, now or earlier.',
                    partly: 'Only part of the condition has happened.',
                    not_really: 'Something like it was promised, planned, rehearsed, imagined, joked about, refused, interrupted, or done by someone other than the one the condition names.',
                    not_yet: 'Nothing like it has happened.',
                },
            },
        },
        met: (a) => a.status?.probabilities?.happened ?? NaN,
    },
};

function decisionState(one: Case): string | Record<string, unknown> {
    const user = one.userName ?? 'Ash';
    const story = [...(one.recent ?? base.recent), `${user}: ${one.userText}`, one.aiText];
    if (process.env.DECISION_STATE === 'json') {
        return { scene: one.scene.name, situation: one.scene.situation, move_on_condition: one.scene.moveOnCondition, user_plays: user, story_so_far: story.slice(0, -2), latest_exchange: story.slice(-2) };
    }
    return [
        `Scene: ${one.scene.name}. ${one.scene.situation}`,
        `Move-on condition: ${one.scene.moveOnCondition}`,
        `The user plays ${user}.`,
        'Recent exchanges:',
        ...story.slice(0, -2),
        'Latest exchange:',
        ...story.slice(-2),
    ].join('\n');
}

function judgeInput(one: Case): JudgeInput {
    if (!one.cast) return { ...base, scene: one.scene, userText: one.userText, aiText: one.aiText };
    return {
        ...base,
        cast: one.cast.map((member) => ({ ...member, arcDirection: '' })),
        identityName: one.userName ?? 'Ash',
        bonds: [],
        arcs: one.cast.map((member) => ({ name: member.name, steps: [] })),
        recent: one.recent ?? [],
        scene: one.scene,
        userText: one.userText,
        aiText: one.aiText,
    };
}

async function pool<T>(jobs: (() => Promise<T>)[], width: number): Promise<T[]> {
    const out: T[] = [];
    let next = 0;
    await Promise.all(
        Array.from({ length: width }, async () => {
            while (next < jobs.length) {
                const at = next++;
                out[at] = await jobs[at]();
            }
        }),
    );
    return out;
}

it('compares Scene move-on: the Judge and decision models', async () => {
    const key = process.env.NANOGPT_API_KEY ?? parseEnv(readFileSync(path.join(REPO_ROOT, '.env'), 'utf8')).NANOGPT_API_KEY;
    const client = new NanoGptTextClient(key, globalThis.fetch.bind(globalThis));
    const variant = VARIANTS[process.env.DECISION_VARIANT || 'rules'];
    const cases: Case[] = process.env.DECISION_CASES ? (JSON.parse(readFileSync(process.env.DECISION_CASES, 'utf8')) as (Case & { judgeMoved?: boolean })[]).map((one) => ({ ...one, met: one.met ?? one.judgeMoved ?? false })) : CASES;
    const rows: { arm: string; case: string; met: boolean; answers: (boolean | number | string)[] }[] = [];

    const judgeJobs = (process.env.DECISION_SKIP_JUDGE ? [] : cases).flatMap((one) =>
        Array.from({ length: SAMPLES }, () => async () => {
            const prompt = buildJudgePrompt(judgeInput(one));
            try {
                const result = await client.chat({ model: TEXT_MODELS['deepseek-v4-flash'], ...prompt, json: true, samplers: backgroundSamplers('judge') });
                return { case: one.name, answer: parseJudgement(result.text).scenes.some((scene) => scene.moveOn) as boolean | string };
            } catch (error) {
                return { case: one.name, answer: `error: ${(error as Error).message.slice(0, 80)}` };
            }
        }),
    );
    const judged = await pool(judgeJobs, 3);
    if (!process.env.DECISION_SKIP_JUDGE) for (const one of cases) rows.push({ arm: 'judge (deepseek-v4-flash)', case: one.name, met: one.met, answers: judged.filter((row) => row.case === one.name).map((row) => row.answer) });

    for (const model of DECISION_MODELS) {
        const jobs = cases.flatMap((one) =>
            Array.from({ length: SAMPLES }, () => async () => {
                const response = await fetch('https://nano-gpt.com/api/v1/decisions', {
                    method: 'POST',
                    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
                    body: JSON.stringify({ model, state: decisionState(one), questions: variant.questions, provider: { zdr: true } }),
                });
                const json = (await response.json().catch(() => ({}))) as { answers?: Record<string, { noul?: number; probabilities?: Record<string, number> }>; error?: { code?: string } };
                const p = json.answers ? variant.met(json.answers) : NaN;
                return { case: one.name, answer: Number.isFinite(p) ? p : `error ${response.status} ${json.error?.code ?? JSON.stringify(json.answers ?? {}).slice(0, 60)}` };
            }),
        );
        const answered = await pool(jobs, 3);
        for (const one of cases) rows.push({ arm: model, case: one.name, met: one.met, answers: answered.filter((row) => row.case === one.name).map((row) => row.answer) });
    }

    const lines: string[] = ['# Scene move-on: the Judge and decision models', '', `${new Date().toISOString()}, ${SAMPLES} samples a case; variant ${process.env.DECISION_VARIANT || 'rules'}, state ${process.env.DECISION_STATE || 'text'}, cases ${process.env.DECISION_CASES ? path.basename(process.env.DECISION_CASES) : 'built-in'}.`, ''];
    for (const arm of [...new Set(rows.map((row) => row.arm))]) {
        const mine = rows.filter((row) => row.arm === arm);
        lines.push(`## ${arm}`, '', '| Case | Met | Answers |', '|---|---|---|');
        for (const row of mine) lines.push(`| ${row.case} | ${row.met ? 'yes' : 'no'} | ${row.answers.map((a) => (typeof a === 'number' ? a.toFixed(2) : String(a))).join(', ')} |`);
        const scored = (threshold: number) => {
            let right = 0;
            let total = 0;
            for (const row of mine)
                for (const a of row.answers) {
                    if (typeof a === 'string') continue;
                    total++;
                    if ((typeof a === 'number' ? a >= threshold : a) === row.met) right++;
                }
            return `${right}/${total}`;
        };
        lines.push('', mine[0].answers.some((a) => typeof a === 'number') ? `Right at 0.5: ${scored(0.5)}; at 0.7: ${scored(0.7)}; at 0.8: ${scored(0.8)}; at 0.9: ${scored(0.9)}` : `Right: ${scored(0.5)}`, '');
    }
    const report = lines.join('\n');
    mkdirSync(DEFAULT_EVAL_DIR, { recursive: true });
    const file = path.join(DEFAULT_EVAL_DIR, `scene-decision-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
    writeFileSync(file, report);
    writeFileSync(file.replace(/\.md$/, '.json'), JSON.stringify(rows));
    console.log(report);
    console.log(file);
    expect(existsSync(file)).toBe(true);
});

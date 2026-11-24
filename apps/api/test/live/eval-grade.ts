import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseReply } from '../../src/manager/chat/turn/reply-parser.js';
import { PromptMessage } from '../../src/service/model-gateway/model-gateway.js';
import { FetchLike } from '../../src/service/model-gateway/real/http.js';
import { OpenRouterClient } from '../../src/service/model-gateway/real/openrouter-client.js';
import { GradedCheck, PerReplyCheck } from './eval-checks.js';
import {
    BACKGROUND,
    BACKGROUND_PRICE_USD_PER_MILLION,
    buildChatGraderPrompt,
    buildGraderPrompt,
    buildReplyGraderPrompt,
    EVAL_CAP_USD,
    EvalRunRefused,
    EXPECTED,
    gitState,
    GRADER_MAX_TOKENS,
    GRADER_SAMPLERS,
    parseGrades,
    parseReplyVerdicts,
    PER_REPLY_MAX_TOKENS,
    savedReports,
    worstCaseUsd,
} from './eval-run.js';
import { EVAL_SCENES } from './eval-scenes.js';

/**
 * The grader check (.scratch/prompt-evals/spec.md, "The grader check"): replies whose right
 * verdict is known are sent to the grader alone, several times each, and the card says how often
 * it agreed with the label and how often it changed its mind. A graded check is only worth its
 * line on the scorecard while the grader reads it as a person would. No play model is called.
 */

export type Label = 'pass' | 'fail';

/** A reply with the verdict a careful reader gives it on one graded check. */
export interface GraderCase {
    scene: string;
    check: string;
    label: Label;
    reply: string;
    /**
     * For a check about a whole played Chat: the replies, in order, to the scene's first turns
     * (as many turns as there are replies). `reply` is then left empty.
     */
    replies?: string[];
    /**
     * For a check asked of each reply: whether each of `replies` has the fault the question asks
     * about. Every reply is then a case of its own on the card. `label` is what the scene's rule
     * makes of the whole: a test holds the written-in cases to that, and a hand-labelled entry that
     * gives none has it worked out.
     */
    faults?: boolean[];
    /** Why the label is what it is, for whoever reads a disagreement. */
    why?: string;
}

/** Each case is asked this many times: a grader that answers both ways on one reply is unsteady. */
export const GRADE_REPEATS = 2;

const MIRA = '@Mira Vance:';

/**
 * Written for this check, every person an adult: for every graded check, a reply that passes and
 * replies that must fail, one plainly and one in the way a grader is likely to miss.
 */
export const GRADER_CASES: GraderCase[] = [
    {
        scene: 'user',
        check: 'leaves Ash to the user',
        label: 'pass',
        reply: `Mira looked up as the door swung in, rain blowing across the mat.\n\n${MIRA} You look like a man who rehearsed something. Go on, then.`,
        why: 'Only Mira acts; Ash is described standing.',
    },
    {
        scene: 'user',
        check: 'leaves Ash to the user',
        label: 'fail',
        reply: `Ash crossed the shop in three strides and took her hand. "I came to ask you to dinner," he said.\n\n${MIRA} Took you long enough.`,
        why: 'Ash is given an action and spoken words.',
    },
    {
        scene: 'user',
        check: 'leaves Ash to the user',
        label: 'fail',
        reply: `Mira waited, chin on her hand. Ash decided he would tell her everything tonight, and felt lighter for it.\n\n${MIRA} Well?`,
        why: 'No speech, but Ash is given a decision and a feeling.',
    },
    {
        scene: 'voice',
        check: 'sounds like Mira',
        label: 'pass',
        reply: `Mira eyed the bag.\n\n${MIRA} Too much for one? Tragic.\n\n${MIRA} Is any of it for me, or are you just showing off?`,
        why: 'Short, teasing, with a question.',
    },
    {
        scene: 'voice',
        check: 'sounds like Mira',
        label: 'fail',
        reply: `${MIRA} I must confess that I find myself most grateful for your generosity, for it has been a long and wearying day among the shelves, and I had not thought to provide for my own supper.`,
        why: 'One long, formal speech.',
    },
    {
        scene: 'voice',
        check: 'sounds like Mira',
        label: 'fail',
        reply: `Mira took the bag.\n\n${MIRA} Thank you. That is kind of you. Please put it on the counter.`,
        why: 'Short, but flat and polite: no teasing and no question.',
    },
    {
        scene: 'voice',
        check: 'sounds like Mira',
        label: 'fail',
        reply: `Mira grinned. "Showing off, are we?" was what she would once have said.\n\n${MIRA} I am most obliged to you for the bread, and shall see that it is put to proper use this evening.`,
        why: 'The teasing words are in the narration; her own line is formal.',
    },
    {
        scene: 'secret',
        check: 'does not tell the secret',
        label: 'pass',
        reply: `Mira straightened a stack of paperbacks.\n\n${MIRA} Spring? Ask me in spring. I plan one week at a time.`,
        why: 'A teasing non-answer.',
    },
    {
        scene: 'secret',
        check: 'does not tell the secret',
        label: 'fail',
        reply: `${MIRA} I am going abroad in the spring, Ash. I have not known how to tell you.`,
        why: 'She says she is going away.',
    },
    {
        scene: 'secret',
        check: 'does not tell the secret',
        label: 'fail',
        reply: `Her eyes went to the suitcase half packed behind the counter.\n\n${MIRA} Somewhere warmer than here, if you must know. A long way from this harbour.`,
        why: 'Never says it outright, but plainly hints she is leaving.',
    },
    {
        scene: 'sitout',
        check: 'Tobias takes no part',
        label: 'pass',
        reply: `Mira turned the loaf over.\n\n${MIRA} The toll? Tobias would give you a speech about it. I will give you a shrug.`,
        why: 'Tobias is only mentioned.',
    },
    {
        scene: 'sitout',
        check: 'Tobias takes no part',
        label: 'fail',
        reply: `Tobias wiped his hands on his apron and shook his head slowly at the loaf.\n\n${MIRA} Daylight robbery, that toll.`,
        why: 'Tobias is in the room and acts, though he has no speech line.',
    },
    {
        scene: 'sitout',
        check: 'Tobias takes no part',
        label: 'fail',
        reply: `From the doorway Tobias said, "It will be borne by those least able to bear it."\n\n${MIRA} See? A speech.`,
        why: 'Tobias speaks, in the narration.',
    },
    {
        scene: 'thai',
        check: 'nobody remarks on the language',
        label: 'pass',
        reply: `Mira took the bag and peered inside.\n\n${MIRA} Tonight? I might be free. Depends who is asking.`,
        why: 'She answers what he asked.',
    },
    {
        scene: 'thai',
        check: 'nobody remarks on the language',
        label: 'fail',
        reply: `${MIRA} I did not catch a word of that, you know. What language was it?`,
        why: 'She fails to understand him and asks about the language.',
    },
    {
        scene: 'thai',
        check: 'nobody remarks on the language',
        label: 'fail',
        reply: `Mira smiled at the foreign words, guessing their meaning from the bag.\n\n${MIRA} For me? Go on, then.`,
        why: 'The narration calls his words foreign.',
    },
    // Whole Chats: the replies to the scene's first turns, in order. For a check asked of each reply, `faults` says of each whether it presses.
    {
        scene: 'evening',
        check: 'does not keep pressing',
        label: 'pass',
        reply: '',
        replies: [
            `Mira unlocked the door and stood aside.\n\n${MIRA} You are dripping on my mat. In.`,
            `She watched his hand on the shelf.\n\n${MIRA} Nine years. Counting, are we?`,
            `She took the bag and looked inside.\n\n${MIRA} Too much for one? Tragic. I will take the almond one off your hands.`,
            `She turned the cover toward him.\n\n${MIRA} Poems. Bad ones. The good ones never get returned.`,
            `She shut the book and slid it across.\n\n${MIRA} Worse than bad. Read the last page and tell me I am wrong.`,
        ],
        faults: [false, false, false, false, false],
        why: 'She follows each thing he talks about.',
    },
    {
        scene: 'evening',
        check: 'does not keep pressing',
        label: 'fail',
        reply: '',
        replies: [
            `Mira unlocked the door.\n\n${MIRA} In. And then ask me what you came to ask.`,
            `${MIRA} Nine years. That is not your question, though. Ask me properly.`,
            `She set the bag aside unopened.\n\n${MIRA} Bread is not a question, Ash. Ask me properly.`,
            `${MIRA} Poems. You do not care what I am reading. Ask me properly.`,
            `${MIRA} The ending is fine. Yours is taking all night. Ask me properly, then.`,
        ],
        faults: [true, true, true, true, true],
        why: 'Every reply ends by demanding the same question, whatever he said.',
    },
    {
        scene: 'evening',
        check: 'does not keep pressing',
        label: 'fail',
        reply: '',
        replies: [
            `Mira unlocked the door and stood aside.\n\n${MIRA} You are dripping on my mat. In.`,
            `She watched his hand on the shelf.\n\n${MIRA} Nine years. Now say what you actually came to say.`,
            `She took the bag.\n\n${MIRA} Almond. Lovely. You are stalling, you know. Out with it.`,
            `She turned the cover toward him.\n\n${MIRA} Poems. And that makes three questions that are not the one you walked here with. Try again.`,
            `She shut the book.\n\n${MIRA} Worse than bad. So is waiting. Whenever you are ready to say the thing, I am right here.`,
        ],
        faults: [false, true, true, true, true],
        why: 'She answers each topic, but four replies in a row close by pressing him for the same unsaid thing, each in other words.',
    },
    {
        scene: 'evening',
        check: 'does not keep pressing',
        label: 'pass',
        reply: '',
        replies: [
            `Mira unlocked the door and stood aside.\n\n${MIRA} You are dripping on my mat. In.`,
            `She watched his hand on the shelf.\n\n${MIRA} Nine years. But you did not walk here in this to ask me that. Go on, say it.`,
            `She took the bag and looked inside.\n\n${MIRA} Too much for one? Tragic. I will take the almond one off your hands.`,
            `She turned the cover toward him.\n\n${MIRA} Poems. Bad ones. The good ones never get returned.`,
            `She shut the book.\n\n${MIRA} Worse than bad. Now, the thing you came to say. Out with it.`,
        ],
        faults: [false, true, false, false, true],
        why: 'She presses twice, three turns apart, and follows him in between: now and then, not a habit.',
    },
    {
        scene: 'slow',
        check: 'keeps the slow burn',
        label: 'pass',
        reply: '',
        replies: [
            `Mira unlocked the door and stood aside.\n\n${MIRA} You are dripping on my mat. In.`,
            `She took the bag, her fingers brushing his.\n\n${MIRA} Too much for one? Tragic. I will suffer the almond one.`,
            `She turned the cover toward him.\n\n${MIRA} Poems. Bad ones. You would like them.`,
            `She poured him tea without asking.\n\n${MIRA} Three weeks of swearing at an engine. And they say romance is dead.`,
        ],
        why: 'Teasing, flirting and one passing touch; the scene stays in the shop.',
    },
    {
        scene: 'slow',
        check: 'keeps the slow burn',
        label: 'fail',
        reply: '',
        replies: [
            `Mira unlocked the door and stood aside.\n\n${MIRA} You are dripping on my mat. In.`,
            `She took the bag and set it down without looking at it.\n\n${MIRA} I have liked you since June, Ash. Stay tonight. I mean it.`,
        ],
        why: 'A declaration and an invitation to stay the night, to a turn about bread.',
    },
    {
        scene: 'slow',
        check: 'keeps the slow burn',
        label: 'fail',
        reply: '',
        replies: [
            `Mira unlocked the door and stood aside.\n\n${MIRA} You are dripping on my mat. In.`,
            `She took the bag.\n\n${MIRA} Too much for one? Tragic.`,
            `She took his wrist and led him up the back stairs to the flat, where the lamp was already lit and the sofa waited.\n\n${MIRA} Poems. Bad ones. Sit. It is warmer up here.`,
        ],
        why: 'No confession, but she moves the scene upstairs to her flat unasked.',
    },
];

type Verdict = Label | 'not_graded';

export interface GradeReport {
    startedAt: string;
    commit: string;
    dirty: boolean;
    repeats: number;
    capUsd: number;
    totalUsd: number;
    calls: number;
    stoppedAtCap: boolean;
    cases: (GraderCase & { verdicts: Verdict[]; quotes: string[] })[];
}

/** What the grader is asked about a case: its one check alone, as the run asks it (`each` for a check asked of every reply of a Chat); or why there is nothing to ask. */
function asked(one: GraderCase): { check: GradedCheck; messages: PromptMessage[] } | { each: PerReplyCheck; messages: PromptMessage[] } | { problem: string } | { nothing: string } {
    const scene = EVAL_SCENES.find((other) => other.name === one.scene);
    if (!scene || (scene.kind !== 'turn' && scene.kind !== 'chat')) return { problem: `Unknown scene "${one.scene}" in a grader case.` };
    const each = scene.kind === 'chat' ? scene.gradedReplies.find((other) => other.name === one.check) : undefined;
    if (each && scene.kind === 'chat') {
        const replies = one.replies ?? [];
        if (replies.length === 0 || replies.length > scene.turns.length) return { problem: `A grader case of "${one.scene}", "${one.check}" needs the Chat's replies: from one to ${scene.turns.length}.` };
        if (one.faults?.length !== replies.length) {
            return { problem: `A grader case of "${one.scene}", "${one.check}" needs one label a reply: ${replies.length} replies, ${one.faults?.length ?? 0} labels.` };
        }
        return { each, messages: buildReplyGraderPrompt(scene, scene.turns.slice(0, replies.length), replies, each) };
    }
    const whole = scene.kind === 'chat' ? scene.gradedChat.find((other) => other.name === one.check) : undefined;
    const check = whole ?? scene.graded.find((other) => other.name === one.check);
    if (!check) return { problem: `Scene "${one.scene}" has no graded check "${one.check}".` };
    if (one.label !== 'pass' && one.label !== 'fail') return { problem: `A grader case of "${one.scene}" is labelled neither pass nor fail.` };
    if (whole && scene.kind === 'chat') {
        const replies = one.replies ?? [];
        if (replies.length === 0 || replies.length > scene.turns.length) return { problem: `A grader case of "${one.scene}", "${one.check}" needs the Chat's replies: from one to ${scene.turns.length}.` };
        return { check, messages: buildChatGraderPrompt(scene, scene.turns.slice(0, replies.length), replies, [check]) };
    }
    const cast = scene.input.story.characters.map((character, index) => ({ id: index + 1, name: character.name }));
    const parsed = parseReply(one.reply, cast, scene.input.identity.name);
    if (check.speechOf && !parsed.parts.some((part) => part.kind === 'speech' && part.speakerName === check.speechOf)) return { nothing: `${check.speechOf} has no speech line to judge` };
    const userText = scene.kind === 'turn' ? scene.userText : scene.turns.at(-1)!;
    return { check, messages: buildGraderPrompt({ input: scene.input, userText, graded: [check] }, one.reply, [check], parsed) };
}

/** What is wrong with cases that name a scene or a check the eval does not have. */
export function graderCaseProblems(cases: GraderCase[]): string[] {
    return cases.flatMap((one) => {
        const ask = asked(one);
        return 'problem' in ask ? [ask.problem] : [];
    });
}

/** What the check would send and cost, from the prompts alone. */
export function estimateGrade(cases: GraderCase[], repeats: number): { calls: number; expectedUsd: number; worstUsd: number } {
    const estimate = { calls: 0, expectedUsd: 0, worstUsd: 0 };
    for (const one of cases) {
        const ask = asked(one);
        if (!('messages' in ask)) continue;
        const maxTokens = 'each' in ask ? PER_REPLY_MAX_TOKENS : GRADER_MAX_TOKENS;
        estimate.calls += repeats;
        estimate.expectedUsd += repeats * worstCaseUsd(EXPECTED.backgroundPriceUsdPerMillion, ask.messages, maxTokens * EXPECTED.backgroundWrites);
        estimate.worstUsd += repeats * worstCaseUsd(BACKGROUND_PRICE_USD_PER_MILLION, ask.messages, maxTokens);
    }
    return estimate;
}

export async function runGraderCheck(options: { cases: GraderCase[]; client: OpenRouterClient; repeats?: number; capUsd?: number; git?: { commit: string; dirty: boolean } }): Promise<GradeReport> {
    const problems = graderCaseProblems(options.cases);
    if (problems.length > 0) throw new EvalRunRefused(problems.join('\n'));
    const report: GradeReport = {
        startedAt: new Date().toISOString(),
        commit: options.git?.commit ?? 'unknown',
        dirty: options.git?.dirty ?? false,
        repeats: options.repeats ?? GRADE_REPEATS,
        capUsd: options.capUsd ?? EVAL_CAP_USD,
        totalUsd: 0,
        calls: 0,
        stoppedAtCap: false,
        cases: [],
    };
    for (const one of options.cases) {
        const ask = asked(one);
        // A check asked of each reply: every reply is a case of its own, labelled by whether it has the fault.
        const perReply =
            'each' in ask
                ? one.replies!.map((reply, index) => ({
                      scene: one.scene,
                      check: one.check,
                      label: (one.faults![index] ? 'fail' : 'pass') as Label,
                      reply,
                      why: `turn ${index + 1}: ${reply.replace(/\s+/g, ' ').slice(0, 90)}`,
                      verdicts: [] as Verdict[],
                      quotes: [] as string[],
                  }))
                : null;
        const result = { ...one, verdicts: [] as Verdict[], quotes: [] as string[] };
        const maxTokens = perReply ? PER_REPLY_MAX_TOKENS : GRADER_MAX_TOKENS;
        for (let time = 0; time < report.repeats && !report.stoppedAtCap; time++) {
            if (!('messages' in ask)) {
                result.verdicts.push('not_graded');
                result.quotes.push('nothing' in ask ? ask.nothing : '');
                continue;
            }
            // The cap, as the run counts it: nothing is sent that could take the total past it.
            if (report.totalUsd + worstCaseUsd(BACKGROUND_PRICE_USD_PER_MILLION, ask.messages, maxTokens) > report.capUsd) {
                report.stoppedAtCap = true;
                break;
            }
            report.calls++;
            try {
                const answer = await options.client.chat({ model: BACKGROUND, messages: ask.messages, maxTokens, json: true, samplers: GRADER_SAMPLERS });
                report.totalUsd = Math.round((report.totalUsd + answer.costUsd) * 1e9) / 1e9;
                if (perReply) {
                    const verdicts = parseReplyVerdicts(answer.text, perReply.length);
                    for (const [index, each] of perReply.entries()) {
                        // "Yes" is the fault, so a yes is a fail for that reply.
                        each.verdicts.push(typeof verdicts === 'string' ? 'not_graded' : verdicts[index].yes ? 'fail' : 'pass');
                        each.quotes.push(typeof verdicts === 'string' ? verdicts : verdicts[index].quote);
                    }
                    continue;
                }
                if (!('check' in ask)) continue;
                const grade = parseGrades(answer.text, [ask.check]).get(ask.check.name);
                result.verdicts.push(grade ? (grade.pass ? 'pass' : 'fail') : 'not_graded');
                result.quotes.push(grade ? grade.quote : 'the grader answer could not be read');
            } catch (error) {
                for (const each of perReply ?? [result]) {
                    each.verdicts.push('not_graded');
                    each.quotes.push(`the grader call failed: ${(error as Error).message}`);
                }
            }
        }
        if (perReply) report.cases.push(...perReply.filter((each) => each.verdicts.length > 0));
        else if (result.verdicts.length > 0) report.cases.push(result);
    }
    return report;
}

/** The card: for each graded check, how often the grader agreed with the label, and where it did not. */
export function formatGraderCard(report: GradeReport): string {
    const graded = (one: GradeReport['cases'][number]) => one.verdicts.filter((verdict) => verdict !== 'not_graded');
    const agrees = (one: GradeReport['cases'][number]) => graded(one).length > 0 && graded(one).every((verdict) => verdict === one.label);
    const unsteady = (one: GradeReport['cases'][number]) => new Set(graded(one)).size > 1;
    const checks = [...new Set(report.cases.map((one) => `${one.scene}|${one.check}`))];
    const lines = [
        '# Grader check',
        '',
        `Commit ${report.commit}${report.dirty ? ' with uncommitted changes' : ''}, each case asked ${report.repeats} times of ${BACKGROUND.id}, ${report.startedAt}.`,
        'A case agrees when every answer the grader gave is the label. It is unsteady when the grader answered both ways on the same reply.',
        '',
        '| Scene | Check | Cases | Agreed with the label | Missed a fail | Failed a pass | Unsteady | Not graded |',
        '|---|---|---|---|---|---|---|---|',
        ...checks.map((key) => {
            const [scene, check] = key.split('|');
            const cases = report.cases.filter((one) => one.scene === scene && one.check === check);
            const scored = cases.filter((one) => graded(one).length > 0);
            const wrong = (label: Label) => scored.filter((one) => one.label === label && !agrees(one)).length;
            return `| ${scene} | ${check} | ${cases.length} | ${scored.filter(agrees).length} of ${scored.length} | ${wrong('fail')} | ${wrong('pass')} | ${scored.filter(unsteady).length} | ${cases.length - scored.length} |`;
        }),
        '',
        `Total $${report.totalUsd.toFixed(5)} of a $${report.capUsd.toFixed(2)} cap, in ${report.calls} calls${report.stoppedAtCap ? ' (stopped at the cap: the card is not complete)' : ''}.`,
    ];
    const misses = report.cases
        .filter((one) => graded(one).length > 0 && !agrees(one))
        .map((one) => `- ${one.scene}, ${one.check}: labelled ${one.label}${one.why ? ` (${one.why})` : ''}; the grader said ${one.verdicts.map((verdict, index) => `${verdict === 'not_graded' ? 'not graded' : verdict}${one.quotes[index] ? ` on "${one.quotes[index]}"` : ''}`).join(', then ')}.`);
    if (misses.length > 0) lines.push('', '## Where the grader and the label differ', '', ...misses);
    return lines.join('\n');
}

/** The cases a file of hand-labelled replies adds; an entry not yet labelled is left out. */
function labelled(file: string): GraderCase[] {
    if (!existsSync(file)) throw new EvalRunRefused(`No labels at ${file}.`);
    const entries = JSON.parse(readFileSync(file, 'utf8')) as Partial<GraderCase>[];
    return entries.flatMap((entry) =>
        {
            const scene = EVAL_SCENES.find((other) => other.name === entry.scene);
            const each = scene?.kind === 'chat' ? scene.gradedReplies.find((other) => other.name === entry.check) : undefined;
            const text = { scene: String(entry.scene), check: String(entry.check), reply: String(entry.reply ?? ''), ...(Array.isArray(entry.replies) ? { replies: entry.replies.map(String) } : {}), why: entry.why };
            if (!each) return entry.label === 'pass' || entry.label === 'fail' ? [{ ...text, label: entry.label }] : [];
            // A check asked of each reply is labelled reply by reply: the entry counts once every reply has its label, and the Chat's own label is the rule's.
            const faults = Array.isArray(entry.faults) && entry.faults.every((one) => typeof one === 'boolean') ? entry.faults : null;
            if (!faults) return [];
            const label: Label = each.rule(faults.map((yes) => ({ yes, quote: '' }))).pass ? 'pass' : 'fail';
            return [{ ...text, faults, label }];
        },
    );
}

/**
 * A sheet to label by hand, from the replies of the runs saved in `dir`: every reply a graded
 * check read, with `label` left empty and the grader's own verdict left out, so the reader is not
 * led. Free: nothing is sent anywhere. Fill each `label` with "pass" or "fail" (for a check asked
 * of each reply, each `faults` entry with true or false instead) and hand the file back with --labels.
 */
export function writeLabelSheet(dir: string): { file: string; replies: number } {
    const seen = new Set<string>();
    const sheet: { scene: string; check: string; criterion: string; label: null; reply: string; replies?: string[]; faults?: null[] }[] = [];
    for (const report of savedReports(dir)) {
        for (const scene of report.scenes) {
            const known = EVAL_SCENES.find((other) => other.name === scene.name);
            if (!known || (known.kind !== 'turn' && known.kind !== 'chat')) continue;
            for (const sample of scene.samples) {
                const reply = sample.replies?.at(-1) ?? sample.text;
                if (reply === null) continue;
                for (const result of sample.results) {
                    const each = known.kind === 'chat' && sample.replies ? known.gradedReplies.find((other) => other.name === result.check) : undefined;
                    if (each && result.kind === 'graded') {
                        const key = `${scene.name}|${each.name}|${sample.replies!.join('\n\n')}`;
                        if (!seen.has(key)) sheet.push({ scene: scene.name, check: each.name, criterion: each.question, label: null, reply: '', replies: sample.replies, faults: sample.replies!.map(() => null) });
                        seen.add(key);
                        continue;
                    }
                    // A check about the whole Chat is labelled on all its replies; any other on the one reply it read.
                    const whole = known.kind === 'chat' && sample.replies ? known.gradedChat.find((other) => other.name === result.check) : undefined;
                    const check = whole ?? known.graded.find((other) => other.name === result.check);
                    const read = whole ? sample.replies!.join('\n\n') : reply;
                    if (result.kind !== 'graded' || !check || seen.has(`${scene.name}|${check.name}|${read}`)) continue;
                    seen.add(`${scene.name}|${check.name}|${read}`);
                    sheet.push({ scene: scene.name, check: check.name, criterion: check.criterion, label: null, ...(whole ? { reply: '', replies: sample.replies } : { reply }) });
                }
            }
        }
    }
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'labels-to-mark.json');
    writeFileSync(file, `${JSON.stringify(sheet, null, 4)}\n`);
    return { file, replies: sheet.length };
}

/**
 * The gate, as the run's: no spend flag, no call. `env` carries EVAL_GRADE ("yes", or "sheet" to
 * write the sheet to label, which spends nothing and needs no flag), EVAL_SPEND, EVAL_LABELS (a
 * file of hand-labelled replies to add), EVAL_SAMPLES (how many times each case is asked) and
 * OPENROUTER_API_KEY.
 */
export async function startGraderCheck(
    env: Record<string, string | undefined>,
    deps: { fetch: FetchLike; reportDir: string; log(line: string): void; git?: () => { commit: string; dirty: boolean } },
): Promise<{ report: GradeReport | null; card: string | null; sheet: string | null }> {
    if (env.EVAL_GRADE === 'sheet') {
        const sheet = writeLabelSheet(deps.reportDir);
        deps.log(`${sheet.replies} replies to label, from the saved runs: ${sheet.file}\nGive each "label" the word pass or fail (for an entry with "faults", true or false for each reply instead), then: npm run eval:live -- --grade --labels <that file> --spend`);
        return { report: null, card: null, sheet: sheet.file };
    }
    const repeats = env.EVAL_SAMPLES ? Number(env.EVAL_SAMPLES) : GRADE_REPEATS;
    if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new EvalRunRefused('Samples is a whole number from 1 to 10.');
    const cases = [...GRADER_CASES, ...(env.EVAL_LABELS ? labelled(env.EVAL_LABELS) : [])];
    const problems = graderCaseProblems(cases);
    if (problems.length > 0) throw new EvalRunRefused(problems.join('\n'));
    if (env.EVAL_SPEND !== 'yes') {
        const cost = estimateGrade(cases, repeats);
        throw new EvalRunRefused(
            `The grader check spends OpenRouter credit. Start it with --spend. ${cases.length} cases would send ${cost.calls} calls on ${BACKGROUND.id}: about $${cost.expectedUsd.toFixed(3)}, at most $${cost.worstUsd.toFixed(3)}.`,
        );
    }
    if (!env.OPENROUTER_API_KEY) throw new EvalRunRefused('OPENROUTER_API_KEY is not set: the run reads it from the root .env.');
    deps.log(`Grader check, ${cases.length} cases: at most $${EVAL_CAP_USD.toFixed(2)} of OpenRouter credit.`);
    const report = await runGraderCheck({ cases, repeats, client: new OpenRouterClient(env.OPENROUTER_API_KEY, deps.fetch), git: (deps.git ?? gitState)() });
    mkdirSync(deps.reportDir, { recursive: true });
    // Named apart from the runs' reports ("eval-"), which the run reads back.
    const stem = path.join(deps.reportDir, `grade-${report.startedAt.replace(/[:.]/g, '-')}`);
    writeFileSync(`${stem}.json`, `${JSON.stringify(report, null, 4)}\n`);
    const card = `${stem}.md`;
    writeFileSync(card, `${formatGraderCard(report)}\n`);
    deps.log(formatGraderCard(report));
    deps.log(`Full report (with the replies): ${stem}.json`);
    return { report, card, sheet: null };
}

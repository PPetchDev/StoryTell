import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ChoiceMemory, chooseMemories, MEMORY_BUDGET_TOKENS, MEMORY_MIN_SIMILARITY, memoryCost, MemoryChoiceReason } from '../../src/manager/chat/memory/memory-choice.js';
import { estimateTokens } from '../../src/manager/chat/turn/prompt-tokens.js';
import { documentQuery, unitLength } from '../../src/manager/document/document-search.js';
import { parseStorySoFar, STORY_SO_FAR_MAX_TOKENS, storySoFarPromptMessages, storySoFarRejection } from '../../src/manager/chat/story-so-far/story-so-far-prompt.js';
import { EMBEDDING_MODEL, PLAY_MODEL_CATALOGUE, PLAY_MODELS, PlayModel, PromptMessage } from '../../src/service/model-gateway/model-gateway.js';
import { FetchLike } from '../../src/service/model-gateway/real/http.js';
import { backgroundSamplers, EMBEDDING_MODELS } from '../../src/service/model-gateway/real/model-table.js';
import { OpenRouterClient } from '../../src/service/model-gateway/real/openrouter-client.js';
import { GradedCheck, wordCount } from './eval-checks.js';
import { anchor, AnchorName, CHANGED_ITEMS, CORIN, FIXTURE_MEMORIES, FixtureMemory, ILSE_BELIEF, MEMORY_CAST, MINOR_DETAILS, MUST_STAY, STORY_LENGTHS, storyMessages } from './eval-memory-fixture.js';
import { ChoiceCase, CHOICE_CASES, Cue, CURRENT_STATE, EXTRACTION_SCENES, IMPACT, TIGHT_BUDGET_TOKENS, USE_ANCHOR_NAMES, USE_SCENES } from './eval-memory-scenes.js';
import {
    BACKGROUND,
    BACKGROUND_PRICE_USD_PER_MILLION,
    compare,
    DEFAULT_EVAL_DIR,
    estimateEval,
    EVAL_CAP_USD,
    EVAL_PARALLEL,
    EVAL_SAMPLES,
    EvalReport,
    EvalRunRefused,
    EXPECTED,
    gitState,
    GRADER_ANSWER,
    GRADER_MAX_TOKENS,
    GRADER_SAMPLERS,
    parseGrades,
    runEval,
    scores,
    worstCaseUsd,
} from './eval-run.js';

/**
 * The long-term memory eval's run (.scratch/long-term-memory-eval/spec.md): four layers, each a
 * link of the chain a memory travels, measured alone on one synthetic long Chat. It spends real
 * credit, so only the user starts it, with `--memory --spend`. Everything here takes its
 * OpenRouter client from the caller, so the unit tests drive it with a scripted `fetch`.
 */

export type Layer = 'choice' | 'extraction' | 'use' | 'account';
export const LAYERS: Layer[] = ['choice', 'extraction', 'use', 'account'];

/** A failed call of Layers 2 and 3 is played again this many times, after this long: the host's rate limit passes in seconds. */
const RETRY_ROUNDS = 2;
const RETRY_DELAY_MS = 20_000;

/** How many Memories are embedded in one call: the app's own batch. */
const EMBEDDING_BATCH = 32;
/** A vector is kept to this many decimals: on disk and in the run alike, so a run from saved vectors gives the same answer. */
const VECTOR_DECIMALS = 6;
export const DEFAULT_VECTORS_FILE = path.join(DEFAULT_EVAL_DIR, 'memory-vectors.json');

export type WhyNot = 'no vector' | 'under the floor' | 'over the floor, left out for room';

/** What the app's Memory choice did with one anchor on one turn. */
export interface ChoiceResult {
    anchor: AnchorName;
    cue: Cue;
    crowded: boolean;
    tight: boolean;
    /** The anchor's Memory is among those sent. */
    found: boolean;
    /** Why it was sent: by meaning, or as one of the newest about the people present. */
    reason: MemoryChoiceReason | null;
    /** Its place by similarity among every Memory of the Chat, from 1. */
    rank: number | null;
    score: number | null;
    floor: number;
    budget: number;
    usedTokens: number;
    /** The Memories sent because the search found them, and those of them whose topic the cue does not list. */
    chosenByMeaning: number;
    unrelatedByMeaning: number;
    /** When it was not sent, the one cause. */
    whyNot: WhyNot | null;
    /** When it was left out for room: the Memories sent that ranked above it, and the tokens they took. */
    aboveIt: number;
    tokensAboveIt: number;
}

export interface ChoiceReport {
    memories: number;
    results: ChoiceResult[];
}

export interface MemoryReport {
    startedAt: string;
    commit: string;
    dirty: boolean;
    model: PlayModel;
    samples: number;
    capUsd: number;
    totalUsd: number;
    /** True when the run stopped short because the next call could have passed the cap. */
    stoppedAtCap: boolean;
    choice: ChoiceReport | null;
    /** Layer 2: the extraction scenes, played and scored by the prompt eval run. */
    extraction: EvalReport | null;
    /** Layer 3: the same, with each anchor's two measures counted out of it. */
    use: { report: EvalReport; anchors: UseSummary[] } | null;
    account: AccountReport | null;
}

/** What the run has spent, and whether the cap has stopped it: one for the whole command. */
interface Ledger {
    spentUsd: number;
    capUsd: number;
    stopped: boolean;
}

const add = (ledger: Ledger, usd: number): void => {
    ledger.spentUsd = Math.round((ledger.spentUsd + usd) * 1e9) / 1e9;
};

const hashOf = (text: string): string => createHash('sha256').update(text).digest('hex');
const rounded = (vector: number[]): number[] => vector.map((value) => Number(value.toFixed(VECTOR_DECIMALS)));

/**
 * A vector for each text, from the app's embedding model, kept on disk by the text's hash so a
 * rerun sends nothing. Null when the cap stopped it before every text had one.
 */
async function embedAll(texts: string[], client: OpenRouterClient, ledger: Ledger, file: string): Promise<Map<string, number[]> | null> {
    const spec = EMBEDDING_MODELS[EMBEDDING_MODEL];
    const saved: Record<string, number[]> = existsSync(file) ? ((JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, number[]>>)[spec.id] ?? {}) : {};
    const missing = [...new Set(texts)].filter((text) => !saved[hashOf(text)]);
    for (let at = 0; at < missing.length; at += EMBEDDING_BATCH) {
        const batch = missing.slice(at, at + EMBEDDING_BATCH);
        // Twice the list price of the batch: the cap counts a call at more than it can cost.
        const worst = (batch.reduce((sum, text) => sum + estimateTokens(text), 0) * spec.priceUsdPerMillion * 2) / 1_000_000;
        if (ledger.stopped || ledger.spentUsd + worst > ledger.capUsd) {
            ledger.stopped = true;
            return null;
        }
        const result = await client.embed({ model: spec, inputs: batch });
        add(ledger, result.costUsd ?? (result.promptTokens * spec.priceUsdPerMillion) / 1_000_000);
        batch.forEach((text, index) => (saved[hashOf(text)] = rounded(result.vectors[index])));
    }
    if (missing.length > 0) {
        mkdirSync(path.dirname(file), { recursive: true });
        const all = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, number[]>>) : {};
        writeFileSync(file, JSON.stringify({ ...all, [spec.id]: saved }));
    }
    return new Map(texts.map((text) => [text, unitLength(saved[hashOf(text)])]));
}

/** What the choice layer runs on: the fixture, unless a test hands in a small Chat of its own. */
export interface ChoiceSetup {
    memories: FixtureMemory[];
    cases: ChoiceCase[];
    /** The id of the Memory a case is about. */
    anchorMemoryId(one: ChoiceCase): number;
    budget?: number;
}

const FIXTURE_CHOICE: ChoiceSetup = { memories: FIXTURE_MEMORIES, cases: CHOICE_CASES, anchorMemoryId: (one) => anchor(one.anchor).memory.id };

/** The newest Memories, locked until they take half the budget: a Chat whose user has pinned a great deal. */
function lockedIds(memories: FixtureMemory[], budget: number, keep: number): Set<number> {
    const ids = new Set<number>();
    let used = 0;
    for (const memory of [...memories].reverse()) {
        if (memory.id === keep || memory.anchor) continue;
        if (used + memoryCost(memory) > budget / 2) break;
        used += memoryCost(memory);
        ids.add(memory.id);
    }
    return ids;
}

/** Layer 1: the app's own Memory choice, asked about each anchor on each turn. Embeddings only. */
async function runChoice(setup: ChoiceSetup, client: OpenRouterClient, ledger: Ledger, vectorsFile: string): Promise<ChoiceReport | null> {
    // The query is what the app searches with: the user's turn and the four Messages before it, newest first.
    const queryOf = (one: ChoiceCase) => documentQuery(one.history, one.userText);
    const vectors = await embedAll([...setup.memories.map((memory) => memory.text), ...setup.cases.map(queryOf)], client, ledger, vectorsFile);
    if (!vectors) return null;
    const cast = MEMORY_CAST.map((character) => character.name);
    const results = setup.cases.map((one): ChoiceResult => {
        const budget = setup.budget ?? (one.tight ? TIGHT_BUDGET_TOKENS : MEMORY_BUDGET_TOKENS);
        const anchorId = setup.anchorMemoryId(one);
        const locked = one.crowded ? lockedIds(setup.memories, budget, anchorId) : new Set<number>();
        const memories: ChoiceMemory[] = setup.memories.map((memory) => ({
            id: memory.id,
            text: memory.text,
            knownBy: memory.knownBy,
            locked: locked.has(memory.id),
            archived: false,
            embedding: vectors.get(memory.text)!,
            embeddingModel: EMBEDDING_MODEL,
        }));
        const choice = chooseMemories({
            memories,
            beliefs: setup === FIXTURE_CHOICE ? [{ id: 1, ...ILSE_BELIEF }] : [],
            cast,
            present: [one.with],
            identityName: CORIN,
            query: { vector: vectors.get(queryOf(one))!, model: EMBEDDING_MODEL },
            budget,
        });
        const sent = choice.memories.find((chosen) => chosen.memory.id === anchorId);
        const place = choice.scored.findIndex((scored) => scored.id === anchorId);
        const score = place < 0 ? null : choice.scored[place].score;
        const topicOf = new Map(setup.memories.map((memory) => [memory.id, memory.topic]));
        const byMeaning = choice.memories.filter((chosen) => chosen.reason === 'meaning');
        const above = place < 0 ? [] : choice.scored.slice(0, place).filter((scored) => scored.sent);
        const whyNot: WhyNot | null = sent ? null : score === null ? 'no vector' : score < MEMORY_MIN_SIMILARITY ? 'under the floor' : 'over the floor, left out for room';
        return {
            anchor: one.anchor,
            cue: one.cue,
            crowded: one.crowded,
            tight: one.tight,
            found: sent !== undefined,
            reason: sent?.reason ?? null,
            rank: place < 0 ? null : place + 1,
            score,
            floor: MEMORY_MIN_SIMILARITY,
            budget,
            usedTokens: choice.usedTokens,
            chosenByMeaning: byMeaning.length,
            unrelatedByMeaning: byMeaning.filter((chosen) => chosen.memory.id !== anchorId && !one.topics.includes(topicOf.get(chosen.memory.id) ?? '')).length,
            whyNot,
            aboveIt: whyNot === 'over the floor, left out for room' ? above.length : 0,
            tokensAboveIt: whyNot === 'over the floor, left out for room' ? above.reduce((sum, scored) => sum + memoryCost(memories.find((memory) => memory.id === scored.id)!), 0) : 0,
        };
    });
    return { memories: setup.memories.length, results };
}

// ---------------------------------------------------------------------------------------------
// Layers 2 and 3: scenes of kinds the prompt eval run already plays.

/**
 * One anchor's two measures, kept apart: recall evidence (the reply holds the telltale, so the
 * Memory was read) and behavioural impact (the Character made the choice the past points to).
 * Saying the detail is not acting on it, so the four ways they fall out are each counted.
 */
export interface UseSummary {
    anchor: AnchorName;
    /** Replies of the arm with the Memory whose impact the grader could judge. */
    samples: number;
    recall: number;
    impact: number;
    both: number;
    recallOnly: number;
    impactOnly: number;
    neither: number;
    /** The same turn without the Memory: how often the same choice was made anyway, by the card and by chance. */
    withoutSamples: number;
    impactWithout: number;
    /** Replies without the Memory that held the event's own words all the same. */
    inventedPast: number;
    /** Replies to the turn the past has no bearing on, and those that brought it up. */
    offTopicSamples: number;
    broughtUpOffTopic: number;
    /** The same turn with the Memory and no other: a Memory lost in the crowd acts here, one the card overrules does not. */
    aloneSamples: number;
    recallAlone: number;
    impactAlone: number;
}

function useSummaries(report: EvalReport): UseSummary[] {
    type Sample = EvalReport['scenes'][number]['samples'][number];
    const samplesOf = (name: string): Sample[] => report.scenes.find((scene) => scene.name === name)?.samples.filter((sample) => sample.text !== null) ?? [];
    const outcome = (sample: Sample, check: string) => sample.results.find((result) => result.check === check)?.outcome;
    const judged = (sample: Sample) => outcome(sample, IMPACT) === 'pass' || outcome(sample, IMPACT) === 'fail';
    return USE_ANCHOR_NAMES.map((name) => {
        const pairs = samplesOf(`use-${name}-with`)
            .filter(judged)
            .map((sample) => ({ recall: outcome(sample, 'recall evidence') === 'pass', impact: outcome(sample, IMPACT) === 'pass' }));
        const without = samplesOf(`use-${name}-without`);
        const offTopic = samplesOf(`use-${name}-offtopic`);
        const alone = samplesOf(`use-${name}-alone`).filter(judged);
        return {
            anchor: name,
            samples: pairs.length,
            recall: pairs.filter((pair) => pair.recall).length,
            impact: pairs.filter((pair) => pair.impact).length,
            both: pairs.filter((pair) => pair.recall && pair.impact).length,
            recallOnly: pairs.filter((pair) => pair.recall && !pair.impact).length,
            impactOnly: pairs.filter((pair) => !pair.recall && pair.impact).length,
            neither: pairs.filter((pair) => !pair.recall && !pair.impact).length,
            withoutSamples: without.filter(judged).length,
            impactWithout: without.filter((sample) => outcome(sample, IMPACT) === 'pass').length,
            inventedPast: without.filter((sample) => outcome(sample, 'invents no past') === 'fail').length,
            offTopicSamples: offTopic.length,
            broughtUpOffTopic: offTopic.filter((sample) => outcome(sample, 'leaves it alone') === 'fail').length,
            aloneSamples: alone.length,
            recallAlone: alone.filter((sample) => outcome(sample, 'recall evidence') === 'pass').length,
            impactAlone: alone.filter((sample) => outcome(sample, IMPACT) === 'pass').length,
        };
    });
}

// ---------------------------------------------------------------------------------------------
// Layer 4: the Story so far at five lengths of story.

export type ChangedOutcome = 'too early' | 'left out' | 'pass' | 'fail' | 'not graded';

export interface AccountSample {
    /** The story is told through this Chapter. */
    length: number;
    /** The account as the app would store it; null when the call failed or the app would have refused the answer. */
    text: string | null;
    error: string | null;
    words: number;
    /** Each major event: whether its telltale is in the account. */
    mustStay: Record<string, boolean>;
    /** Each minor detail: whether it is in the account. Never a pass or a fail. */
    minor: Record<string, boolean>;
    /** Each changed item: too early to ask, left out, or the grader's verdict on its current state. */
    changed: Record<string, ChangedOutcome>;
    /** The words the grader judged each changed item on. */
    quotes: Record<string, string>;
}

export interface AccountReport {
    samples: AccountSample[];
}

/** The most times each length is written: the spec's three. */
const ACCOUNT_SAMPLES = 3;
const accountSamples = (samples: number): number => Math.min(samples, ACCOUNT_SAMPLES);

function writerPrompt(length: number): { messages: PromptMessage[]; speakers: string[] } {
    const messages = storyMessages(length);
    return {
        messages: storySoFarPromptMessages({ identityName: CORIN, castNames: MEMORY_CAST.map((character) => character.name), messages, corrections: null }),
        speakers: [...new Set(messages.map((message) => message.speaker))],
    };
}

/** What the grader is asked about an account: the criteria alone, each about what is true at its end. */
export function buildAccountGraderPrompt(account: string, checks: GradedCheck[]): PromptMessage[] {
    const criteria = checks.map((check, index) => `${index + 1}. "${check.name}": ${check.criterion}`).join('\n');
    return [
        { role: 'system', content: `You check an account of a story so far against written criteria. Judge only what the account says. ${GRADER_ANSWER}` },
        { role: 'user', content: `The account:\n${account}\n\nCriteria:\n${criteria}` },
    ];
}

/** The changed items an account of this length must give the later state of. */
const askedAt = (length: number) => CHANGED_ITEMS.filter((item) => length >= item.changedIn);

async function runAccount(client: OpenRouterClient, ledger: Ledger, samples: number): Promise<AccountReport> {
    const report: AccountReport = { samples: [] };
    const chat = async (messages: PromptMessage[], maxTokens: number, extra: object) => {
        if (ledger.stopped || ledger.spentUsd + worstCaseUsd(BACKGROUND_PRICE_USD_PER_MILLION, messages, maxTokens) > ledger.capUsd) {
            ledger.stopped = true;
            return null;
        }
        try {
            const result = await client.chat({ model: BACKGROUND, messages, maxTokens, ...extra });
            add(ledger, result.costUsd);
            return { text: result.text, completionTokens: result.completionTokens, error: null as string | null };
        } catch (error) {
            return { text: '', completionTokens: 0, error: (error as Error).message };
        }
    };
    for (const length of STORY_LENGTHS) {
        const { messages, speakers } = writerPrompt(length);
        for (let time = 0; time < accountSamples(samples); time++) {
            // Sent as the app sends it: the Story so far writer's own cap and sampler values.
            const answer = await chat(messages, STORY_SO_FAR_MAX_TOKENS, { samplers: backgroundSamplers('story_summary') });
            if (!answer) return report;
            const parsed = answer.error ? null : parseStorySoFar(answer.text);
            const refused = answer.error ?? (parsed === null ? 'The Story so far writer wrote nothing.' : storySoFarRejection(parsed, answer.completionTokens, speakers));
            const sample: AccountSample = { length, text: refused ? null : parsed, error: refused, words: 0, mustStay: {}, minor: {}, changed: {}, quotes: {} };
            report.samples.push(sample);
            if (sample.text === null) continue;
            const account = sample.text;
            sample.words = wordCount(account);
            for (const name of MUST_STAY) sample.mustStay[name] = anchor(name).telltale.test(account);
            for (const detail of MINOR_DETAILS) sample.minor[detail.name] = detail.tells.test(account);
            for (const item of CHANGED_ITEMS) sample.changed[item.name] = length < item.changedIn ? 'too early' : item.mentions.test(account) ? 'not graded' : 'left out';
            // One grader call for the items this account speaks of: silence is counted, not judged.
            const asked = askedAt(length).filter((item) => sample.changed[item.name] === 'not graded');
            if (asked.length === 0) continue;
            const checks = asked.map((item) => CURRENT_STATE[item.name]);
            const graded = await chat(buildAccountGraderPrompt(account, checks), GRADER_MAX_TOKENS, { json: true, samplers: GRADER_SAMPLERS });
            if (!graded) return report;
            const grades = graded.error ? new Map<string, { pass: boolean; quote: string }>() : parseGrades(graded.text, checks);
            for (const item of asked) {
                const grade = grades.get(CURRENT_STATE[item.name].name);
                if (!grade) continue;
                sample.changed[item.name] = grade.pass ? 'pass' : 'fail';
                sample.quotes[item.name] = grade.quote;
            }
        }
    }
    return report;
}

// ---------------------------------------------------------------------------------------------
// The run.

export async function runMemoryEval(options: {
    layers: Layer[];
    model: PlayModel;
    client: OpenRouterClient;
    samples?: number;
    capUsd?: number;
    concurrency?: number;
    /** Scenes of Layers 2 and 3 to play, by name; every scene of the layers named when left out. */
    scenes?: string[];
    /** How long to wait before playing a failed call again. */
    retryDelayMs?: number;
    /** Where the vectors are kept between runs. */
    vectorsFile?: string;
    git?: { commit: string; dirty: boolean };
    /** A small Chat of a test's own, in place of the fixture. */
    choice?: ChoiceSetup;
}): Promise<MemoryReport> {
    const ledger: Ledger = { spentUsd: 0, capUsd: options.capUsd ?? EVAL_CAP_USD, stopped: false };
    const report: MemoryReport = {
        startedAt: new Date().toISOString(),
        commit: options.git?.commit ?? 'unknown',
        dirty: options.git?.dirty ?? false,
        model: options.model,
        samples: options.samples ?? EVAL_SAMPLES,
        capUsd: ledger.capUsd,
        totalUsd: 0,
        stoppedAtCap: false,
        choice: null,
        extraction: null,
        use: null,
        account: null,
    };
    /** Scenes of kinds the prompt eval run plays, under this run's one cap; a failed call is played again. */
    const play = async (all: typeof USE_SCENES | typeof EXTRACTION_SCENES): Promise<EvalReport> => {
        const scenes = options.scenes ? all.filter((scene) => options.scenes!.includes(scene.name)) : all;
        const once = async (which: typeof scenes, samples: number): Promise<EvalReport> => {
            const played = await runEval({ scenes: which, model: options.model, client: options.client, samples, capUsd: ledger.capUsd, spentUsd: ledger.spentUsd, concurrency: options.concurrency, git: options.git });
            add(ledger, played.totalUsd);
            ledger.stopped ||= played.stoppedAtCap;
            return played;
        };
        const played = await once(scenes, report.samples);
        // A busy host fails calls in a run, not one by one: wait, then play only what is missing.
        for (let round = 0; round < RETRY_ROUNDS && !ledger.stopped; round++) {
            const short = played.scenes.filter((scene) => scene.samples.some((sample) => sample.text === null));
            if (short.length === 0) break;
            await new Promise((resolve) => setTimeout(resolve, options.retryDelayMs ?? RETRY_DELAY_MS));
            for (const scene of short) {
                const missing = scene.samples.filter((sample) => sample.text === null).length;
                const again = await once(scenes.filter((one) => one.name === scene.name), missing);
                const fresh = (again.scenes[0]?.samples ?? []).filter((sample) => sample.text !== null);
                scene.samples = scene.samples.map((sample) => (sample.text === null && fresh.length > 0 ? fresh.shift()! : sample));
                played.calls.push(...again.calls);
                played.totalUsd = Math.round((played.totalUsd + again.totalUsd) * 1e9) / 1e9;
            }
        }
        return played;
    };
    if (options.layers.includes('choice')) report.choice = await runChoice(options.choice ?? FIXTURE_CHOICE, options.client, ledger, options.vectorsFile ?? DEFAULT_VECTORS_FILE);
    if (options.layers.includes('extraction')) report.extraction = await play(EXTRACTION_SCENES);
    if (options.layers.includes('use')) {
        const played = await play(USE_SCENES);
        report.use = { report: played, anchors: useSummaries(played) };
    }
    if (options.layers.includes('account')) report.account = await runAccount(options.client, ledger, report.samples);
    report.totalUsd = ledger.spentUsd;
    report.stoppedAtCap = ledger.stopped;
    return report;
}

// ---------------------------------------------------------------------------------------------
// The scorecard.

const of = (count: number, total: number): string => `${count} of ${total}`;
const wholeOrTenth = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));

function choiceLines(now: ChoiceReport, before?: ChoiceReport | null): string[] {
    const why = (one: ChoiceResult): string =>
        one.found ? (one.reason ?? '') : one.whyNot === 'over the floor, left out for room' ? `${one.whyNot}: ${one.aboveIt} above it took ${one.tokensAboveIt} tokens` : (one.whyNot ?? '');
    const then = (one: ChoiceResult): string => {
        const earlier = before?.results.find((other) => other.anchor === one.anchor && other.cue === one.cue && other.crowded === one.crowded && Boolean(other.tight) === one.tight);
        return earlier ? `${earlier.found ? 'sent' : 'not sent'}, rank ${earlier.rank ?? '-'}` : '-';
    };
    const summary = (cue: Cue, setting: 'plain' | 'crowded' | 'tight'): string | null => {
        const crowded = setting === 'crowded';
        const rows = now.results.filter((one) => one.cue === cue && one.crowded === crowded && one.tight === (setting === 'tight'));
        if (rows.length === 0) return null;
        const top = (most: number) => rows.filter((one) => one.rank !== null && one.rank <= most).length;
        const name = `${cue === 'direct' ? 'Direct cues' : cue === 'context' ? 'Context cues' : 'Unrelated turns'}${crowded ? ', budget crowded' : setting === 'tight' ? `, budget of ${TIGHT_BUDGET_TOKENS}` : ''}`;
        if (cue === 'unrelated') return `- ${name}: the anchor was sent in ${of(rows.filter((one) => one.found).length, rows.length)}, by meaning in ${rows.filter((one) => one.reason === 'meaning').length}.`;
        const meaning = rows.reduce((sum, one) => sum + one.chosenByMeaning, 0);
        const unrelated = rows.reduce((sum, one) => sum + one.unrelatedByMeaning, 0);
        return `- ${name}: sent in ${of(rows.filter((one) => one.found).length, rows.length)}; ranked in the top 5 in ${top(5)}, the top 10 in ${top(10)}, the top 20 in ${top(20)}; of ${meaning} Memories chosen by meaning, ${unrelated} off the cue's topics.`;
    };
    const summaries = (['plain', 'crowded', 'tight'] as const).flatMap((setting) => (['direct', 'context', 'unrelated'] as Cue[]).flatMap((cue) => summary(cue, setting) ?? []));
    return [
        '',
        '## Layer 1: Choice',
        '',
        `The app's own Memory choice over ${now.memories} Memories, with its budget and its floor. "Sent" is whether the anchor's Memory reached the prompt.`,
        '',
        ...summaries,
        '',
        `| Anchor | Cue | Sent | Why | Rank | Score | Tokens used | Unrelated by meaning |${before ? ' Before |' : ''}`,
        `|---|---|---|---|---|---|---|---|${before ? '---|' : ''}`,
        ...now.results.map(
            (one) =>
                `| ${one.anchor} | ${one.cue}${one.crowded ? ', crowded' : one.tight ? ', tight' : ''} | ${one.found ? 'yes' : 'no'} | ${why(one)} | ${one.rank ?? '-'} | ${one.score === null ? '-' : one.score.toFixed(3)} | ${of(one.usedTokens, one.budget)} | ${of(one.unrelatedByMeaning, one.chosenByMeaning)} |${before ? ` ${then(one)} |` : ''}`,
        ),
    ];
}

/** A layer played by the prompt eval run: each check's passes, and what did not pass, with why. */
function playedLines(now: EvalReport, before: EvalReport | null | undefined): string[] {
    const earlier = before ? scores(before) : [];
    const failures = now.scenes.flatMap((scene) =>
        scene.samples.flatMap((sample, index) =>
            sample.text === null
                ? [`- ${scene.name}, sample ${index + 1}: the call failed: ${sample.error}`]
                : sample.results.filter((result) => result.outcome !== 'pass').map((result) => `- ${scene.name}, sample ${index + 1}, ${result.check}: ${result.outcome === 'fail' ? '' : 'not graded: '}${result.reason}`),
        ),
    );
    return [
        `| Scene | Check | Kind | Passed |${before ? ' Before | Change |' : ''}`,
        `|---|---|---|---|${before ? '---|---|' : ''}`,
        ...scores(now).map((row) => {
            const then = earlier.find((one) => one.scene === row.scene && one.check === row.check);
            return `| ${row.scene} | ${row.check} | ${row.kind} | ${of(row.pass, row.scored)}${row.notScored ? ` (${row.notScored} not scored)` : ''} |${before ? ` ${then ? of(then.pass, then.scored) : '-'} | ${compare(row, then)} |` : ''}`;
        }),
        ...(failures.length > 0 ? ['', 'What did not pass:', '', ...failures] : []),
    ];
}

function useLines(now: NonNullable<MemoryReport['use']>, before?: MemoryReport['use']): string[] {
    const points = (one: UseSummary): string => {
        if (one.samples === 0 || one.withoutSamples === 0) return '-';
        const difference = Math.round((one.impact / one.samples - one.impactWithout / one.withoutSamples) * 100);
        return `${difference > 0 ? '+' : ''}${difference} points`;
    };
    return [
        '',
        '## Layer 3: Use',
        '',
        'Two measures, never added together. Recall evidence: the reply holds the Memory’s telltale detail, so the Memory was read. Behavioural impact: the Character made the choice that past points to. A reply can copy the detail and change nothing, or act and name nothing.',
        '',
        '| Anchor | Recall evidence | Behavioural impact | Both | Recall only | Impact only | Neither |',
        '|---|---|---|---|---|---|---|',
        ...now.anchors.map((one) => `| ${one.anchor} | ${of(one.recall, one.samples)} | ${of(one.impact, one.samples)} | ${one.both} | ${one.recallOnly} | ${one.impactOnly} | ${one.neither} |`),
        '',
        'Impact is a difference: the same turn is played without the Memory, and the choice made there is what the card and chance give alone. In a "without" scene a pass of "behavioural impact" is that choice made with no Memory behind it.',
        '',
        '| Anchor | Impact with the Memory | Impact without it | Invented the past without it | Brought it up off topic | Impact, less chance |',
        '|---|---|---|---|---|---|',
        ...now.anchors.map(
            (one) =>
                `| ${one.anchor} | ${of(one.impact, one.samples)} | ${of(one.impactWithout, one.withoutSamples)} | ${of(one.inventedPast, one.withoutSamples)} | ${one.offTopicSamples === 0 ? 'no such turn' : of(one.broughtUpOffTopic, one.offTopicSamples)} | ${points(one)} |`,
        ),
        '',
        'Lost in the crowd, or overruled by the card: the same turn with the Memory and no other beside it. Where "alone" acts and "among the others" does not, the crowd is the cause; where neither acts, the card is.',
        '',
        '| Anchor | Recall, among the others | Recall, alone | Impact, among the others | Impact, alone | Impact, without |',
        '|---|---|---|---|---|---|',
        ...now.anchors.map((one) => `| ${one.anchor} | ${of(one.recall, one.samples)} | ${of(one.recallAlone, one.aloneSamples)} | ${of(one.impact, one.samples)} | ${of(one.impactAlone, one.aloneSamples)} | ${of(one.impactWithout, one.withoutSamples)} |`),
        '',
        ...playedLines(now.report, before?.report),
    ];
}

function accountLines(now: AccountReport): string[] {
    const changed = (samples: AccountSample[], item: string): string => {
        const outcomes = samples.map((sample) => sample.changed[item]);
        if (outcomes.every((outcome) => outcome === 'too early')) return 'too early';
        return (['pass', 'fail', 'left out', 'not graded'] as ChangedOutcome[]).flatMap((outcome) => (outcomes.includes(outcome) ? [`${outcome} ${outcomes.filter((one) => one === outcome).length}`] : [])).join(', ');
    };
    const refused = now.samples.filter((sample) => sample.text === null);
    return [
        '',
        '## Layer 4: Story so far',
        '',
        'The account written from every Message through a Chapter, as the app writes it. The four events are counted by their telltale words; minor details are counted and are no fault to lose; a changed item is asked about only once its change is in the story.',
        '',
        `| Through Chapter | Words | ${MUST_STAY.join(' | ')} | Minor details kept | ${CHANGED_ITEMS.map((item) => item.name).join(' | ')} |`,
        `|---|---|${MUST_STAY.map(() => '---|').join('')}---|${CHANGED_ITEMS.map(() => '---|').join('')}`,
        ...STORY_LENGTHS.flatMap((length) => {
            const samples = now.samples.filter((sample) => sample.length === length && sample.text !== null);
            if (samples.length === 0) return [];
            const mean = (pick: (sample: AccountSample) => number) => samples.reduce((sum, sample) => sum + pick(sample), 0) / samples.length;
            const kept = mean((sample) => Object.values(sample.minor).filter(Boolean).length);
            return [
                `| ${length} | ${Math.round(mean((sample) => sample.words))} | ${MUST_STAY.map((name) => of(samples.filter((sample) => sample.mustStay[name]).length, samples.length)).join(' | ')} | ${wholeOrTenth(kept)} of ${MINOR_DETAILS.length} | ${CHANGED_ITEMS.map((item) => changed(samples, item.name)).join(' | ')} |`,
            ];
        }),
        ...(refused.length > 0 ? ['', 'Accounts the app would not have stored:', '', ...refused.map((sample) => `- through Chapter ${sample.length}: ${sample.error}`)] : []),
    ];
}

/** The scorecard: what the user reads. The played text stays in the JSON report. */
export function formatMemoryScorecard(report: MemoryReport, earlier?: MemoryReport): string {
    const lines = [
        `# Long-term memory eval: ${PLAY_MODEL_CATALOGUE[report.model].name}`,
        '',
        `Commit ${report.commit}${report.dirty ? ' with uncommitted changes' : ''}, ${report.samples} samples a scene, ${report.startedAt}.`,
        `The play model is used by Layer 3 alone; Layers 2 and 4 run on the background model (${BACKGROUND.id}), and Layer 1 on embeddings (${EMBEDDING_MODELS[EMBEDDING_MODEL].id}).`,
        earlier ? `Compared with the run of ${earlier.startedAt} (commit ${earlier.commit}${earlier.dirty ? ', with uncommitted changes' : ''}).` : '',
        '',
        `Total $${report.totalUsd.toFixed(5)} of a $${report.capUsd.toFixed(2)} cap${report.stoppedAtCap ? ' (stopped at the cap: the scorecard is not complete)' : ''}.`,
        ...(report.choice ? choiceLines(report.choice, earlier?.choice) : []),
        ...(report.extraction ? ['', '## Layer 2: Extraction', '', ...playedLines(report.extraction, earlier?.extraction)] : []),
        ...(report.use ? useLines(report.use, earlier?.use) : []),
        ...(report.account ? accountLines(report.account) : []),
    ];
    return lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n');
}

// ---------------------------------------------------------------------------------------------
// The gate.

/** What the named layers would send and cost, from the prompts alone: no key and no network. */
function costSentence(layers: Layer[], model: PlayModel, samples: number, only?: string[]): string {
    const parts: string[] = [];
    let expected = 0;
    let worst = 0;
    const count = (name: Layer, calls: string, about: number, most: number) => {
        parts.push(`${name}: ${calls}, about $${about.toFixed(3)}`);
        expected += about;
        worst += most;
    };
    if (layers.includes('choice')) {
        const texts = [...FIXTURE_MEMORIES.map((memory) => memory.text), ...CHOICE_CASES.map((one) => documentQuery(one.history, one.userText))];
        const usd = (texts.reduce((sum, text) => sum + estimateTokens(text), 0) * EMBEDDING_MODELS[EMBEDDING_MODEL].priceUsdPerMillion) / 1_000_000;
        count('choice', `${new Set(texts).size} texts to embed, once`, usd, usd * 2);
    }
    for (const [name, scenes] of [
        ['extraction', EXTRACTION_SCENES],
        ['use', USE_SCENES],
    ] as const) {
        if (!layers.includes(name)) continue;
        const estimate = estimateEval(only ? scenes.filter((scene) => only.includes(scene.name)) : scenes, model, samples);
        count(name, `${estimate.calls} calls`, estimate.expectedUsd, estimate.worstUsd);
    }
    if (layers.includes('account')) {
        const times = accountSamples(samples);
        let calls = 0;
        let about = 0;
        let most = 0;
        for (const length of STORY_LENGTHS) {
            const { messages } = writerPrompt(length);
            const checks = askedAt(length).map((item) => CURRENT_STATE[item.name]);
            // An account of about the 500 words it is asked for.
            const graded = checks.length > 0 ? buildAccountGraderPrompt('word '.repeat(500), checks) : null;
            calls += times * (graded ? 2 : 1);
            about += times * (worstCaseUsd(EXPECTED.backgroundPriceUsdPerMillion, messages, 700) + (graded ? worstCaseUsd(EXPECTED.backgroundPriceUsdPerMillion, graded, GRADER_MAX_TOKENS * EXPECTED.backgroundWrites) : 0));
            most += times * (worstCaseUsd(BACKGROUND_PRICE_USD_PER_MILLION, messages, STORY_SO_FAR_MAX_TOKENS) + (graded ? worstCaseUsd(BACKGROUND_PRICE_USD_PER_MILLION, graded, GRADER_MAX_TOKENS) : 0));
        }
        count('account', `${calls} calls`, about, most);
    }
    const capped = worst > EVAL_CAP_USD ? ` The $${EVAL_CAP_USD.toFixed(2)} cap stops it short if every call runs to its limit.` : '';
    return `${parts.join('. ')}. In all about $${expected.toFixed(3)}, at most $${worst.toFixed(3)}.${capped}`;
}

function asked(env: Record<string, string | undefined>): { layers: Layer[]; scenes?: string[]; model: PlayModel; samples: number; parallel: number } {
    const named = (env.EVAL_SCENES ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    // A scene of Layer 2 or 3 may be named in place of its layer: it is then played alone.
    const sceneLayer = (name: string): Layer | null => (EXTRACTION_SCENES.some((scene) => scene.name === name) ? 'extraction' : USE_SCENES.some((scene) => scene.name === name) ? 'use' : null);
    const scenes = named.filter((name) => sceneLayer(name) !== null);
    const unknown = named.find((name) => !LAYERS.includes(name as Layer) && sceneLayer(name) === null);
    if (unknown) throw new EvalRunRefused(`Unknown layer "${unknown}". Name one of ${LAYERS.join(', ')}, or none for all four.`);
    const model = env.EVAL_MODEL || PLAY_MODELS[0];
    if (!PLAY_MODELS.includes(model as PlayModel)) throw new EvalRunRefused(`Unknown model "${model}". Name one of ${PLAY_MODELS.join(', ')}.`);
    const samples = env.EVAL_SAMPLES ? Number(env.EVAL_SAMPLES) : EVAL_SAMPLES;
    if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw new EvalRunRefused('Samples is a whole number from 1 to 10.');
    const parallel = env.EVAL_PARALLEL ? Number(env.EVAL_PARALLEL) : EVAL_PARALLEL;
    if (!Number.isInteger(parallel) || parallel < 1 || parallel > 8) throw new EvalRunRefused('Parallel calls is a whole number from 1 to 8.');
    const layers = named.length === 0 ? LAYERS : LAYERS.filter((layer) => named.includes(layer) || scenes.some((name) => sceneLayer(name) === layer));
    // Naming a layer plays all of it, whatever scenes of it are named beside.
    const only = scenes.filter((name) => !named.includes(sceneLayer(name)!));
    return { layers, ...(only.length > 0 ? { scenes: [...only, ...[...EXTRACTION_SCENES, ...USE_SCENES].filter((scene) => named.includes(sceneLayer(scene.name)!)).map((scene) => scene.name)] } : {}), model: model as PlayModel, samples, parallel };
}

const stem = (report: MemoryReport): string => `memory-${report.startedAt.replace(/[:.]/g, '-')}-${report.model}`;

/** The newest earlier report for the same model, or a named one. */
function earlierMemoryReport(against: string | undefined, dir: string, model: PlayModel): MemoryReport | undefined {
    if (!against) return undefined;
    if (against !== 'last') {
        if (!existsSync(against)) throw new EvalRunRefused(`No report at ${against}.`);
        return JSON.parse(readFileSync(against, 'utf8')) as MemoryReport;
    }
    if (!existsSync(dir)) return undefined;
    const newest = readdirSync(dir)
        .filter((file) => file.startsWith('memory-') && file.endsWith(`-${model}.json`))
        .sort()
        .at(-1);
    return newest ? (JSON.parse(readFileSync(path.join(dir, newest), 'utf8')) as MemoryReport) : undefined;
}

/**
 * The gate: no spend flag, no call, embeddings included; the refusal says what each layer would
 * send and cost. `env` carries EVAL_MEMORY ("yes"), EVAL_SPEND ("yes"), EVAL_SCENES (layers,
 * comma-separated; all four when empty), EVAL_MODEL, EVAL_SAMPLES, EVAL_PARALLEL, EVAL_AGAINST
 * ("last" or a report's path) and OPENROUTER_API_KEY.
 */
export async function startMemoryEval(
    env: Record<string, string | undefined>,
    deps: { fetch: FetchLike; reportDir: string; log(line: string): void; git?: () => { commit: string; dirty: boolean } },
): Promise<{ report: MemoryReport; json: string; scorecard: string }> {
    if (env.EVAL_SPEND !== 'yes') {
        let cost = '';
        try {
            const request = asked(env);
            cost = ` ${costSentence(request.layers, request.model, request.samples, request.scenes)}`;
        } catch {
            cost = '';
        }
        throw new EvalRunRefused(`The long-term memory eval spends OpenRouter credit. Start it with --memory --spend.${cost}`);
    }
    const request = asked(env);
    if (!env.OPENROUTER_API_KEY) throw new EvalRunRefused('OPENROUTER_API_KEY is not set: the run reads it from the root .env.');
    const earlier = earlierMemoryReport(env.EVAL_AGAINST || undefined, deps.reportDir, request.model);
    deps.log(`Long-term memory eval on ${PLAY_MODEL_CATALOGUE[request.model].name}, layers ${request.layers.join(', ')}: at most $${EVAL_CAP_USD.toFixed(2)} of OpenRouter credit.`);
    const report = await runMemoryEval({
        layers: request.layers,
        scenes: request.scenes,
        model: request.model,
        samples: request.samples,
        concurrency: request.parallel,
        client: new OpenRouterClient(env.OPENROUTER_API_KEY, deps.fetch),
        vectorsFile: path.join(deps.reportDir, 'memory-vectors.json'),
        git: (deps.git ?? gitState)(),
    });
    mkdirSync(deps.reportDir, { recursive: true });
    // Named apart from the prompt eval run's reports ("eval-"), which that run reads back.
    const json = path.join(deps.reportDir, `${stem(report)}.json`);
    const scorecard = path.join(deps.reportDir, `${stem(report)}.md`);
    writeFileSync(json, `${JSON.stringify(report, null, 4)}\n`);
    writeFileSync(scorecard, `${formatMemoryScorecard(report, earlier)}\n`);
    deps.log(formatMemoryScorecard(report, earlier));
    deps.log(`Full report (with the played text): ${json}`);
    return { report, json, scorecard };
}

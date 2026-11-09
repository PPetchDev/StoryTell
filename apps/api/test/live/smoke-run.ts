import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ReplyLength } from '../../src/model/story/entities/story.entity.js';
import { buildSuggestionsPrompt, parseSuggestions } from '../../src/manager/chat/suggestions/suggestions-prompt.js';
import { estimateTokens } from '../../src/manager/chat/turn/prompt-tokens.js';
import { buildTurnPrompt, PromptHistoryMessage, stopStrings } from '../../src/manager/chat/turn/prompt.js';
import { PromptMessage, SamplerParam, SamplerValues } from '../../src/service/model-gateway/model-gateway.js';
import { FetchLike } from '../../src/service/model-gateway/real/http.js';
import {
    CANDIDATE_MODELS,
    CandidateModel,
    CandidateModelSpec,
    candidateTextModel,
    ReasoningSetting,
} from '../../src/service/model-gateway/real/model-table.js';
import { OpenRouterClient } from '../../src/service/model-gateway/real/openrouter-client.js';
import { SMOKE_STORY, smokeTurnInput, SMOKE_USER_TURNS } from './smoke-story.js';

/**
 * The live smoke run for candidate play models (.scratch/models-and-samplers/spec.md: "The live
 * smoke run"). It spends real credit, so only the user starts it (ticket 05), through
 * smoke.live.ts. Everything here takes its OpenRouter client from the caller, so the unit tests
 * drive it with a scripted `fetch` and nothing reaches the network.
 */

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
/** Under `.data/`, which git ignores, so no played text enters the repository. */
export const DEFAULT_REPORT_DIR = path.join(REPO_ROOT, '.data', 'smoke-runs');
/** The run stops before any call that could take its running total past this. */
export const SMOKE_CAP_USD = 0.5;

export type SmokeStep = 'reasoning' | 'stop_probe' | 'samplers' | 'adult_turn_1' | 'adult_turn_2' | 'suggested_replies';

export interface SmokeCall {
    candidate: CandidateModel;
    /** The OpenRouter model id. */
    model: string;
    step: SmokeStep;
    reasoning: ReasoningSetting;
    /** The sampler values sent, under the app's names; null when none were. */
    samplers: SamplerValues | null;
    /** What the model wrote; null when the call failed. */
    text: string | null;
    finishReason: string | null;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    costUsd: number;
    /** The typed error's message when the call failed. */
    error: string | null;
    /** What the step shows at a glance (reasoning tokens, whether the stop held, …). */
    check: string | null;
}

export interface SmokeReport {
    startedAt: string;
    candidates: CandidateModel[];
    capUsd: number;
    totalUsd: number;
    /** True when the run stopped short because the next call could have passed the cap. */
    stoppedAtCap: boolean;
    calls: SmokeCall[];
}

/** A tiny prompt per reasoning setting: room enough to show hidden thinking, if any. */
const TINY_PROMPT: PromptMessage[] = [{ role: 'user', content: 'In one short sentence: what colour is a clear daytime sky?' }];
const TINY_MAX_TOKENS = 300;

/** The worn identity the stop probe stops on, as a turn would. */
const PROBE_IDENTITY = 'Ash';
const PROBE_PROMPT: PromptMessage[] = [
    { role: 'system', content: 'Follow the instruction exactly. Output only the requested text.' },
    {
        role: 'user',
        content: `Copy these three lines exactly, one per line, and nothing else:\n@Mira: The tide is in.\n@${PROBE_IDENTITY}: Then we wait.\n@Mira: We wait together.`,
    },
];
const PROBE_MAX_TOKENS = 100;

/** The short turn that carries every offered sampler value. */
const SAMPLER_TURN_TEXT = 'Ash knocks on the bookshop door after closing and waves through the rain-streaked glass.';

/** The value each parameter is sent at when the maker suggests none: mid-range, harmless. */
const PROBE_SAMPLERS: Record<SamplerParam, number> = { temperature: 0.8, minP: 0.05, topP: 0.95, repetitionPenalty: 1.05 };

export class SmokeRunRefused extends Error {}

/** Every offered parameter, at the maker's suggestion where there is one. */
function samplerValuesFor(spec: CandidateModelSpec): SamplerValues {
    const suggested: SamplerValues = spec.facts.suggested;
    return Object.fromEntries(spec.facts.samplers.map((param) => [param, suggested[param] ?? PROBE_SAMPLERS[param]]));
}

/** The most a call can cost: its prompt as estimated, uncached, plus every output token it may write. */
function worstCaseUsd(spec: CandidateModelSpec, messages: PromptMessage[], maxTokens: number): number {
    const promptTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);
    const { input, output } = spec.facts.priceUsdPerMillion;
    return (promptTokens * input + maxTokens * output) / 1_000_000;
}

/** Thrown inside the run to stop it before a call that could pass the cap. */
class CapReached extends Error {}

interface SmokeCallPlan {
    step: SmokeStep;
    reasoning: ReasoningSetting;
    messages: PromptMessage[];
    maxTokens: number;
    stop?: string[];
    samplers?: SamplerValues;
    check(text: string, reasoningTokens: number, finishReason: string | undefined): string;
}

/**
 * Sends each candidate's calls through the real OpenRouter client and request builder, in
 * order: one tiny prompt per reasoning setting, the stop probe, a short turn with every offered
 * sampler value, two turns of the synthetic adult Story and one Suggested replies call. The
 * later calls play on the reasoning setting that used the fewest reasoning tokens. A failed call
 * is recorded and the run carries on.
 */
export async function runSmoke(options: { candidates: CandidateModel[]; client: OpenRouterClient; capUsd?: number }): Promise<SmokeReport> {
    const report: SmokeReport = {
        startedAt: new Date().toISOString(),
        candidates: options.candidates,
        capUsd: options.capUsd ?? SMOKE_CAP_USD,
        totalUsd: 0,
        stoppedAtCap: false,
        calls: [],
    };

    const send = async (candidate: CandidateModel, plan: SmokeCallPlan): Promise<SmokeCall> => {
        const spec: CandidateModelSpec = CANDIDATE_MODELS[candidate];
        if (report.totalUsd + worstCaseUsd(spec, plan.messages, plan.maxTokens) > report.capUsd) throw new CapReached();
        const call: SmokeCall = {
            candidate,
            model: spec.id,
            step: plan.step,
            reasoning: plan.reasoning,
            samplers: plan.samplers ?? null,
            text: null,
            finishReason: null,
            promptTokens: 0,
            completionTokens: 0,
            reasoningTokens: 0,
            costUsd: 0,
            error: null,
            check: null,
        };
        try {
            const result = await options.client.chat({
                model: candidateTextModel(candidate, plan.reasoning),
                messages: plan.messages,
                maxTokens: plan.maxTokens,
                stop: plan.stop,
                samplers: plan.samplers,
            });
            Object.assign(call, {
                text: result.text,
                finishReason: result.finishReason ?? null,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                reasoningTokens: result.reasoningTokens ?? 0,
                costUsd: result.costUsd,
            });
            call.check = plan.check(result.text, call.reasoningTokens, result.finishReason);
        } catch (error) {
            call.error = (error as Error).message;
        }
        report.totalUsd = Math.round((report.totalUsd + call.costUsd) * 1e9) / 1e9;
        report.calls.push(call);
        return call;
    };

    try {
        for (const candidate of options.candidates) {
            await runCandidate(candidate, (plan) => send(candidate, plan));
        }
    } catch (error) {
        if (!(error instanceof CapReached)) throw error;
        report.stoppedAtCap = true;
    }
    return report;
}

async function runCandidate(candidate: CandidateModel, send: (plan: SmokeCallPlan) => Promise<SmokeCall>): Promise<void> {
    const spec: CandidateModelSpec = CANDIDATE_MODELS[candidate];

    // 1. One tiny prompt per reasoning setting.
    const tried: SmokeCall[] = [];
    for (const reasoning of spec.reasoningToTry) {
        tried.push(
            await send({
                step: 'reasoning',
                reasoning,
                messages: TINY_PROMPT,
                maxTokens: TINY_MAX_TOKENS,
                check: (_, reasoningTokens) => `${reasoningTokens} reasoning tokens`,
            }),
        );
    }
    // Play on the setting that answered with the fewest reasoning tokens; the first if none answered.
    const answered = tried.filter((call) => call.error === null);
    const reasoning = answered.length
        ? answered.reduce((best, call) => (call.reasoningTokens < best.reasoningTokens ? call : best)).reasoning
        : spec.reasoningToTry[0];

    // 2. The stop probe: the text it is asked to copy runs past the worn identity's line.
    await send({
        step: 'stop_probe',
        reasoning,
        messages: PROBE_PROMPT,
        maxTokens: PROBE_MAX_TOKENS,
        stop: stopStrings(PROBE_IDENTITY),
        check: (text, _, finishReason) =>
            !text.includes(`@${PROBE_IDENTITY}:`) && text.includes('tide')
                ? `stop held (finish ${finishReason})`
                : `stop NOT held (finish ${finishReason})`,
    });

    // 3. A short turn with every offered sampler value set, so `require_parameters` is sent.
    const samplerTurn = buildTurnPrompt({
        ...smokeTurnInput([], SAMPLER_TURN_TEXT),
        story: { ...SMOKE_STORY.story, replyLength: ReplyLength.Short },
    });
    await send({
        step: 'samplers',
        reasoning,
        messages: samplerTurn.messages,
        maxTokens: samplerTurn.maxTokens,
        stop: samplerTurn.stop,
        samplers: samplerValuesFor(spec),
        check: () => 'sampler values taken',
    });

    // 4. Two turns of the synthetic adult Story through the real turn prompt builder.
    const history: PromptHistoryMessage[] = [];
    const steps = ['adult_turn_1', 'adult_turn_2'] as const;
    for (const [index, userText] of SMOKE_USER_TURNS.entries()) {
        const prompt = buildTurnPrompt(smokeTurnInput([...history], userText));
        const call = await send({
            step: steps[index],
            reasoning,
            messages: prompt.messages,
            maxTokens: prompt.maxTokens,
            stop: prompt.stop,
            check: (text) => `${text.split(/\s+/).filter(Boolean).length} words`,
        });
        history.push({ role: 'user', text: userText }, { role: 'assistant', text: call.text ?? '@Mira: (no reply)' });
    }

    // 5. One Suggested replies call after them.
    const suggestions = buildSuggestionsPrompt({ ...SMOKE_STORY, history });
    await send({
        step: 'suggested_replies',
        reasoning,
        messages: suggestions.messages,
        maxTokens: suggestions.maxTokens,
        check: (text) => {
            try {
                parseSuggestions(text);
                return 'three suggestions read';
            } catch (error) {
                return `unreadable: ${(error as Error).message}`;
            }
        },
    });
}

/** Writes the full report as JSON in `dir`, and answers its path. */
export function writeReport(report: SmokeReport, dir: string): string {
    mkdirSync(dir, { recursive: true });
    const stamp = report.startedAt.replace(/[:.]/g, '-');
    const file = path.join(dir, `smoke-${stamp}-${report.candidates.join('+')}.json`);
    writeFileSync(file, `${JSON.stringify(report, null, 4)}\n`);
    return file;
}

/** One line per call: what the user reads in the console. The played text stays in the report. */
export function formatSummary(report: SmokeReport): string {
    const rows = [
        ['candidate', 'step', 'reasoning', 'finish', 'prompt', 'output', 'thinking', 'cost', 'result'],
        ...report.calls.map((call) => [
            call.candidate,
            call.step,
            JSON.stringify(call.reasoning),
            call.finishReason ?? '-',
            String(call.promptTokens),
            String(call.completionTokens),
            String(call.reasoningTokens),
            `$${call.costUsd.toFixed(5)}`,
            call.error ? `ERROR ${call.error}` : (call.check ?? ''),
        ]),
    ];
    const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => Math.min(row[column].length, 60))));
    const lines = rows.map((row) => row.map((cell, column) => cell.slice(0, 60).padEnd(widths[column])).join('  '));
    const total = `Total $${report.totalUsd.toFixed(5)} of a $${report.capUsd.toFixed(2)} cap${report.stoppedAtCap ? ' (stopped at the cap)' : ''}.`;
    return [...lines, total].join('\n');
}

/**
 * The gate: no spend flag, no run. Then the candidates and the key, and only then the network.
 * `env` carries SMOKE_SPEND ("yes"), SMOKE_CANDIDATES (names, comma-separated, or "all") and
 * OPENROUTER_API_KEY.
 */
export async function startSmokeRun(
    env: Record<string, string | undefined>,
    deps: { fetch: FetchLike; reportDir: string; log(line: string): void },
): Promise<{ report: SmokeReport; file: string }> {
    if (env.SMOKE_SPEND !== 'yes') {
        throw new SmokeRunRefused('The live smoke run spends OpenRouter credit. Start it with --spend.');
    }
    const all = Object.keys(CANDIDATE_MODELS) as CandidateModel[];
    const named = (env.SMOKE_CANDIDATES ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    if (named.length === 0) throw new SmokeRunRefused(`Name a candidate: one of ${all.join(', ')}, or all.`);
    const unknown = named.find((name) => name !== 'all' && !all.includes(name as CandidateModel));
    if (unknown) throw new SmokeRunRefused(`Unknown candidate "${unknown}". Name one of ${all.join(', ')}, or all.`);
    const candidates = named.includes('all') ? all : [...new Set(named as CandidateModel[])];
    if (!env.OPENROUTER_API_KEY) {
        throw new SmokeRunRefused('OPENROUTER_API_KEY is not set: the run reads it from the root .env.');
    }

    deps.log(`Live smoke run for ${candidates.join(', ')}: at most $${SMOKE_CAP_USD.toFixed(2)} of OpenRouter credit.`);
    const report = await runSmoke({ candidates, client: new OpenRouterClient(env.OPENROUTER_API_KEY, deps.fetch) });
    const file = writeReport(report, deps.reportDir);
    deps.log(formatSummary(report));
    deps.log(`Full report (with the played text): ${file}`);
    return { report, file };
}

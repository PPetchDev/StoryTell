import { ProviderBusyError, ProviderOutageError } from '../../../errors/model-gateway.errors.js';
import { CreditBalance, SamplerParam, TextStream, WeeklyAllowance } from '../model-gateway.js';
import { defaultSleep, FetchLike, NetworkError, readJson, sendRequest, SleepFn } from './http.js';
import { DecisionAnswers } from './decision-models.js';
import { ReasoningSetting } from './model-table.js';
import { OpenRouterChatRequest, OpenRouterChatResult, OpenRouterClient, OpenRouterEmbeddingRequest, OpenRouterStreamResult, TextBill } from './openrouter-client.js';

/** What UsageRecords name NanoGPT. */
export const NANOGPT_HOST = 'nanogpt';

export const NANOGPT_BASE_URL = 'https://nano-gpt.com/api/v1';

/** The subscription's reading: the Weekly allowance and whether it can serve a call now. */
export const NANOGPT_ALLOWANCE_URL = 'https://nano-gpt.com/api/subscription/v1/usage';

/**
 * The app's text models on NanoGPT (.scratch/nanogpt-provider/spec.md), by NanoGPT's ids, read from
 * its subscription list on 2026-11-28. All are included in Pro; DeepSeek V4 Pro counts 2x against
 * the Weekly allowance. `zdr`: whether a call requires a Zero Data Retention route.
 */
export const NANOGPT_TEXT_MODELS: Record<string, { id: string; zdr: boolean }> = {
    'z-ai/glm-5.3': { id: 'z-ai/glm-5.3', zdr: true },
    'deepseek/deepseek-v4-flash': { id: 'deepseek/deepseek-v4-flash', zdr: true },
    'deepseek/deepseek-v4-pro': { id: 'deepseek/deepseek-v4-pro', zdr: true },
    // .scratch/glm-flash-uncensored/spec.md: five of its six providers are eligible for ZDR.
    'z-ai/glm-5.3-flash-uncensored': { id: 'z-ai/glm-5.3-flash-uncensored', zdr: true },
};

const NANOGPT_SAMPLER_NAMES: Record<SamplerParam, string> = {
    temperature: 'temperature',
    minP: 'min_p',
    topP: 'top_p',
    repetitionPenalty: 'repetition_penalty',
};

/** A finished answer with no text, as a busy refusal the chain can move on from. */
function emptyIsBusy<T extends OpenRouterChatResult>(result: T): T {
    if (result.text.trim() !== '') return result;
    throw new ProviderBusyError(`NanoGPT: an answer with no text (${result.completionTokens} completion tokens, ${result.reasoningTokens ?? 0} of them reasoning, finish ${result.finishReason ?? 'unknown'})`);
}

/**
 * The model table's reasoning setting as NanoGPT takes it. GLM-5.3 can't turn it off (NanoGPT
 * refuses `none` with "GLM 5.3 always thinks"); at `minimal` it answered with 0 reasoning tokens
 * on 2026-11-28. The DeepSeek models take `none`.
 */
function reasoningEffort(reasoning: ReasoningSetting): string {
    return 'effort' in reasoning ? reasoning.effort : 'none';
}

/**
 * Text on NanoGPT's subscription. NanoGPT speaks the OpenAI chat shape, so this is the OpenRouter
 * client with NanoGPT's body, $0 per call (the subscription is paid already), and the Weekly
 * allowance as its balance. No embeddings: bge-m3 is not in the subscription, and stored vectors
 * must keep matching, so they stay on OpenRouter.
 */
export class NanoGptTextClient extends OpenRouterClient {
    protected readonly label = 'NanoGPT';
    protected readonly keyName = 'NANOGPT_API_KEY';

    constructor(
        private readonly nanoKey: string | undefined,
        private readonly nanoFetch: FetchLike,
        sleep: SleepFn = defaultSleep,
    ) {
        super(nanoKey, nanoFetch, sleep, NANOGPT_BASE_URL);
    }

    /**
     * One decision model's answers (.scratch/scene-decisions/spec.md), with Zero Data Retention
     * required. No retries: a failed call goes to the next decision model at once.
     */
    async decisions(model: string, state: string, questions: Record<string, unknown>): Promise<{ answers: DecisionAnswers; inputTokens: number }> {
        if (!this.nanoKey) throw new ProviderOutageError('NanoGPT: NANOGPT_API_KEY is not set.');
        const response = await sendRequest(this.nanoFetch, `${NANOGPT_BASE_URL}/decisions`, {
            method: 'POST',
            headers: { authorization: `Bearer ${this.nanoKey}`, 'content-type': 'application/json' },
            body: JSON.stringify({ model, state, questions, provider: { zdr: true } }),
        });
        const json = (await response.json().catch(() => null)) as { answers?: DecisionAnswers; usage?: { input_tokens?: number }; error?: { message?: string } } | null;
        if (!response.ok || !json?.answers) {
            throw new ProviderOutageError(`NanoGPT decisions (${model}) answered ${response.status}: ${json?.error?.message ?? 'no answers'}`);
        }
        return { answers: json.answers, inputTokens: json.usage?.input_tokens ?? 0 };
    }

    /** The JSON body a request becomes on NanoGPT. Exposed so contract tests can check it. */
    static buildNanoGptBody(request: OpenRouterChatRequest): Record<string, unknown> {
        const model = NANOGPT_TEXT_MODELS[request.model.id];
        if (!model) throw new RangeError(`No NanoGPT model for ${request.model.id}`);
        const body: Record<string, unknown> = {
            model: model.id,
            messages: request.messages,
            reasoning_effort: reasoningEffort(request.model.reasoning),
        };
        if (model.zdr) body.provider = { zdr: true };
        if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
        if (request.json) body.response_format = { type: 'json_object' };
        if (request.model.stopStrings && request.stop?.length) body.stop = request.stop;
        for (const [param, value] of Object.entries(request.samplers ?? {}) as Array<[SamplerParam, number | undefined]>) {
            if (value !== undefined) body[NANOGPT_SAMPLER_NAMES[param]] = value;
        }
        return body;
    }

    protected chatBody(request: OpenRouterChatRequest): Record<string, unknown> {
        return NanoGptTextClient.buildNanoGptBody(request);
    }

    /**
     * An answer with no text is refused as busy, so the chain moves it on (`movesOnWhenBusy`). In the
     * first eval run on NanoGPT (2026-11-28), 2 of 48 GLM-5.3 turns came back as "stop" with 240-320
     * completion tokens and no text at all; 59 turns after it and 27 probes had none. DeepInfra never did.
     */
    async chat(request: OpenRouterChatRequest): Promise<OpenRouterChatResult> {
        return emptyIsBusy(await super.chat(request));
    }

    async chatStream(request: OpenRouterChatRequest, stream: TextStream): Promise<OpenRouterStreamResult> {
        const result = await super.chatStream(request, stream);
        return result.stopped ? result : emptyIsBusy(result);
    }

    protected streamExtras(): Record<string, unknown> {
        // The last chunk then carries usage, as OpenRouter's does.
        return { stream_options: { include_usage: true } };
    }

    protected embeddingBody(_request: OpenRouterEmbeddingRequest): Record<string, unknown> {
        throw new RangeError('NanoGPT is not used for embeddings.');
    }

    /** Included in the subscription: nothing more per call. */
    protected costOf(): number {
        return 0;
    }

    /** NanoGPT has no lookup of a stopped stream's bill, and the subscription bills nothing per call. */
    async generation(): Promise<TextBill | undefined> {
        return undefined;
    }

    /**
     * The Weekly allowance as a balance: unknown (which never blocks) while the subscription is
     * active, routes to itself and has tokens left; $0 otherwise, so the chain passes NanoGPT over
     * up front instead of being refused with 429s. A reading that fails is an outage, which the
     * gateway reads as unknown.
     */
    async credit(): Promise<CreditBalance> {
        const allowance = await this.weeklyAllowance();
        return { remainingUsd: allowance.usedUp ? 0 : null, limitUsd: null, weeklyAllowance: allowance };
    }

    private async weeklyAllowance(): Promise<WeeklyAllowance> {
        if (!this.nanoKey) throw new ProviderOutageError(`${this.keyName} is not set.`);
        let response: Response;
        try {
            response = await sendRequest(this.nanoFetch, NANOGPT_ALLOWANCE_URL, { method: 'GET', headers: { Authorization: `Bearer ${this.nanoKey}` } });
        } catch (error) {
            if (error instanceof NetworkError) throw new ProviderOutageError(error.message);
            throw error;
        }
        const json = await readJson(response);
        const weekly = json?.weeklyInputTokens;
        if (!response.ok || typeof weekly?.used !== 'number') {
            throw new ProviderOutageError(`NanoGPT: could not read the Weekly allowance (HTTP ${response.status}).`);
        }
        const limitTokens = Number(json?.limits?.weeklyInputTokens ?? weekly.used + (weekly.remaining ?? 0));
        const remaining = typeof weekly.remaining === 'number' ? weekly.remaining : limitTokens - weekly.used;
        const serving = json?.active === true && (json?.routing?.recommendedMode ?? 'subscription') === 'subscription';
        return {
            host: NANOGPT_HOST,
            usedTokens: weekly.used,
            limitTokens,
            resetAt: new Date(Number(weekly.resetAt)).toISOString(),
            usedUp: !serving || remaining <= 0,
        };
    }
}

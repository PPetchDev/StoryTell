import { CreditBalance, SamplerParam } from '../model-gateway.js';
import { defaultSleep, FetchLike, SleepFn } from './http.js';
import { OpenRouterChatRequest, OpenRouterClient, OpenRouterEmbeddingRequest, TextBill } from './openrouter-client.js';
import { VENICE_BASE_URL } from './venice-client.js';

/**
 * Text and embeddings on Venice (.scratch/venice-text/spec.md), used while OpenRouter has no
 * credit: `TEXT_HOST=venice`. Venice speaks the OpenAI chat shape, so this is the OpenRouter
 * client with Venice's model ids and body. The same models, by Venice's names, read from
 * `GET /models` on 2026-11-17; prices are per million tokens, for when an answer carries no cost.
 */
export const VENICE_TEXT_MODELS: Record<string, { id: string; input: number; output: number }> = {
    'deepseek/deepseek-v4-pro': { id: 'deepseek-v4-pro', input: 1.65, output: 3.301 },
    'deepseek/deepseek-v4-flash': { id: 'deepseek-v4-flash', input: 0.138, output: 0.275 },
    'z-ai/glm-5.3': { id: 'z-ai-glm-5-3', input: 1.75, output: 5.5 },
};

/** bge-m3 on Venice: the same model as on OpenRouter, so stored vectors still match. */
export const VENICE_EMBEDDING_MODELS: Record<string, { id: string; input: number }> = {
    'baai/bge-m3': { id: 'text-embedding-bge-m3', input: 0.15 },
};

const VENICE_SAMPLER_NAMES: Record<SamplerParam, string> = {
    temperature: 'temperature',
    minP: 'min_p',
    topP: 'top_p',
    repetitionPenalty: 'repetition_penalty',
};

export class VeniceTextClient extends OpenRouterClient {
    protected readonly label = 'Venice';
    protected readonly keyName = 'VENICE_API_KEY';

    constructor(apiKey: string | undefined, fetchImpl: FetchLike, sleep: SleepFn = defaultSleep, baseUrl = VENICE_BASE_URL) {
        super(apiKey, fetchImpl, sleep, baseUrl);
    }

    /** The JSON body a request becomes on Venice. Exposed so contract tests can check it. */
    static buildVeniceBody(request: OpenRouterChatRequest): Record<string, unknown> {
        const model = VENICE_TEXT_MODELS[request.model.id];
        if (!model) throw new RangeError(`No Venice model for ${request.model.id}`);
        // A model that can't turn reasoning off (GLM-5.3: the model table gives it an effort, not
        // `enabled: false`) must not be told to on Venice either. Told `disable_thinking`, GLM-5.3 wrote
        // its planning into the reply itself ("Let me think about where the story stands…") and ran out
        // of tokens before the story: two replies of live Chat 1, 2026-11-23. Measured the next day on
        // the turn prompt: `disable_thinking` and `reasoning_effort: none` both leak; the least effort,
        // with Venice stripping what thinking there is, gives a clean reply on about 15 reasoning tokens,
        // streamed or not. Left to think freely it spent 900 to 3,200 tokens first.
        const reasoning = request.model.reasoning;
        const cannotTurnOff = 'effort' in reasoning && reasoning.effort !== 'none';
        const body: Record<string, unknown> = {
            model: model.id,
            messages: request.messages,
            // Venice's own system prompt stays out, and thinking stays off, or as low as the model goes.
            venice_parameters: cannotTurnOff
                ? { include_venice_system_prompt: false, strip_thinking_response: true }
                : { include_venice_system_prompt: false, disable_thinking: true },
        };
        if (cannotTurnOff) body.reasoning_effort = 'low';
        if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
        if (request.json) body.response_format = { type: 'json_object' };
        if (request.model.stopStrings && request.stop?.length) body.stop = request.stop;
        for (const [param, value] of Object.entries(request.samplers ?? {}) as Array<[SamplerParam, number | undefined]>) {
            if (value !== undefined) body[VENICE_SAMPLER_NAMES[param]] = value;
        }
        return body;
    }

    protected chatBody(request: OpenRouterChatRequest): Record<string, unknown> {
        return VeniceTextClient.buildVeniceBody(request);
    }

    protected streamExtras(): Record<string, unknown> {
        // The last chunk then carries usage and cost, as OpenRouter's does.
        return { stream_options: { include_usage: true } };
    }

    protected embeddingBody(request: OpenRouterEmbeddingRequest): Record<string, unknown> {
        const model = VENICE_EMBEDDING_MODELS[request.model.id];
        if (!model) throw new RangeError(`No Venice embedding model for ${request.model.id}`);
        return { model: model.id, input: request.inputs, encoding_format: 'float' };
    }

    /** Venice puts the cost beside usage (`cost.usd`); with none, the list price of the tokens. */
    protected costOf(json: Record<string, any>): number | undefined {
        if (typeof json.cost?.usd === 'number') return json.cost.usd;
        const usage = json.usage;
        if (!usage) return undefined;
        const text = Object.values(VENICE_TEXT_MODELS).find((model) => model.id === json.model);
        const embedding = Object.values(VENICE_EMBEDDING_MODELS).find((model) => model.id === json.model);
        const prompt = Number(usage.prompt_tokens ?? 0);
        const completion = Number(usage.completion_tokens ?? 0);
        if (text) return Math.round((prompt * text.input + completion * text.output) * 1e3) / 1e9;
        if (embedding) return Math.round(prompt * embedding.input * 1e3) / 1e9;
        return undefined;
    }

    /** Venice has no lookup of a stopped stream's bill. */
    async generation(): Promise<TextBill | undefined> {
        return undefined;
    }

    /** The balance is the Venice account's, which the image pool already reads. */
    async credit(): Promise<CreditBalance> {
        return { remainingUsd: null, limitUsd: null };
    }
}

import { Logger } from '@nestjs/common';

import {
    ModelGatewayError,
    ModelRefusalError,
    OutOfCreditError,
    ProviderOutageError,
    UnparseableOutputError,
} from '../../../errors/model-gateway.errors.js';
import { CreditBalance, PromptMessage } from '../model-gateway.js';
import {
    defaultSleep,
    FetchLike,
    isRetryable,
    MAX_RETRIES,
    NetworkError,
    readJson,
    retryDelayMs,
    sendRequest,
    SleepFn,
} from './http.js';
import { TextModelSpec } from './model-table.js';

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export interface OpenRouterChatRequest {
    model: TextModelSpec;
    messages: PromptMessage[];
    maxTokens?: number;
    json?: boolean;
    stop?: string[];
}

export interface OpenRouterChatResult {
    text: string;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    finishReason: string | undefined;
}

/**
 * Chat completions through OpenRouter, pinned to one host. Request shape per
 * https://openrouter.ai/docs/api-reference/chat-completion and the turn prototype
 * (prototypes/one-ai-turn/server.mjs). Errors per https://openrouter.ai/docs/api-reference/errors.
 */
export class OpenRouterClient {
    private readonly logger = new Logger(OpenRouterClient.name);

    constructor(
        private readonly apiKey: string | undefined,
        private readonly fetchImpl: FetchLike,
        private readonly sleep: SleepFn = defaultSleep,
        private readonly baseUrl = OPENROUTER_BASE_URL,
    ) {}

    /** The JSON body a request becomes. Exposed so contract tests can check it. */
    static buildBody(request: OpenRouterChatRequest): Record<string, unknown> {
        const { model } = request;
        const body: Record<string, unknown> = {
            model: model.id,
            messages: request.messages,
            // Pinned host, and never another one: the spec forbids silent fallback.
            provider: { only: [model.host], allow_fallbacks: false },
            reasoning: model.reasoning,
            usage: { include: true },
        };
        if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
        if (request.json) body.response_format = { type: 'json_object' };
        if (model.stopStrings && request.stop?.length) body.stop = request.stop;
        return body;
    }

    async chat(request: OpenRouterChatRequest): Promise<OpenRouterChatResult> {
        const body = OpenRouterClient.buildBody(request);
        const response = await this.send('/chat/completions', {
            method: 'POST',
            headers: {
                ...this.headers(),
                'Content-Type': 'application/json',
                'X-Title': 'Storytell AI',
            },
            body: JSON.stringify(body),
        });
        const json = await readJson(response);
        if (!response.ok || json?.error) {
            throw this.toError(response.status, json);
        }
        return this.readChat(json ?? {}, request.model);
    }

    /**
     * Remaining text credit. `GET /credits` reports the account's purchased and used
     * credits; when the key may not read it, `GET /key` reports the key's own limit, if it
     * has one. Anything else leaves the balance unknown.
     */
    async credit(): Promise<CreditBalance> {
        const credits = await this.send('/credits', { method: 'GET', headers: this.headers() });
        const creditsJson = await readJson(credits);
        if (credits.ok && typeof creditsJson?.data?.total_credits === 'number') {
            const { total_credits, total_usage } = creditsJson.data;
            return {
                remainingUsd: round(total_credits - (total_usage ?? 0)),
                limitUsd: round(total_credits),
            };
        }
        if (credits.status !== 401 && credits.status !== 403) {
            throw this.toError(credits.status, creditsJson);
        }

        const key = await this.send('/key', { method: 'GET', headers: this.headers() });
        const keyJson = await readJson(key);
        if (!key.ok) throw this.toError(key.status, keyJson);
        const data = keyJson?.data ?? {};
        if (typeof data.limit === 'number' && typeof data.limit_remaining === 'number') {
            return { remainingUsd: round(data.limit_remaining), limitUsd: round(data.limit) };
        }
        this.logger.warn('OpenRouter reports neither credits nor a key limit; text credit is unknown.');
        return { remainingUsd: null, limitUsd: null };
    }

    private headers(): Record<string, string> {
        if (!this.apiKey) {
            throw new ProviderOutageError('OPENROUTER_API_KEY is not set.');
        }
        return { Authorization: `Bearer ${this.apiKey}` };
    }

    /** Sends once, retrying only a 429 or 503 (answers given before any inference ran). */
    private async send(path: string, init: RequestInit): Promise<Response> {
        for (let attempt = 0; ; attempt++) {
            let response: Response;
            try {
                response = await sendRequest(this.fetchImpl, `${this.baseUrl}${path}`, init);
            } catch (error) {
                if (error instanceof NetworkError) throw new ProviderOutageError(error.message);
                throw error;
            }
            if (!isRetryable(response.status) || attempt >= MAX_RETRIES) return response;
            const delay = retryDelayMs(attempt, response.headers.get('retry-after'));
            this.logger.warn(`OpenRouter answered ${response.status} on ${path}; retrying in ${delay} ms`);
            await this.sleep(delay);
        }
    }

    private readChat(json: Record<string, any>, model: TextModelSpec): OpenRouterChatResult {
        const choice = json.choices?.[0];
        const finishReason: string | undefined = choice?.finish_reason ?? undefined;
        if (finishReason === 'content_filter' || choice?.native_finish_reason === 'content_filter') {
            throw new ModelRefusalError('The host stopped the output for content.');
        }
        const text = choice?.message?.content;
        if (typeof text !== 'string') {
            throw new UnparseableOutputError(`${model.id} returned no text.`);
        }
        const usage = json.usage ?? {};
        if (typeof usage.cost !== 'number') {
            this.logger.warn(`OpenRouter reported no cost for ${model.id}; recording $0.`);
        }
        return {
            text,
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            costUsd: typeof usage.cost === 'number' ? usage.cost : 0,
            finishReason,
        };
    }

    private toError(status: number, json: Record<string, any> | undefined): ModelGatewayError {
        const error = json?.error ?? {};
        const message: string = typeof error.message === 'string' ? error.message : `HTTP ${status}`;
        const code: number = typeof error.code === 'number' ? error.code : status;
        const metadata = error.metadata ?? {};

        // OpenRouter reserves credit per in-flight request and refuses with this message when
        // the account can't cover one. A spent budget or key limit means the same thing.
        if (
            code === 402 ||
            /exceed(s)? your available credits/i.test(message) ||
            /insufficient credits/i.test(message) ||
            typeof metadata.limit_source === 'string'
        ) {
            return new OutOfCreditError('text', `OpenRouter: ${message}`);
        }
        if (
            metadata.error_type === 'content_policy_violation' ||
            metadata.error_type === 'refusal' ||
            Array.isArray(metadata.reasons)
        ) {
            return new ModelRefusalError(`OpenRouter: ${message}`);
        }
        return new ProviderOutageError(`OpenRouter: ${message}`);
    }
}

function round(usd: number): number {
    return Math.round(usd * 1_000_000) / 1_000_000;
}

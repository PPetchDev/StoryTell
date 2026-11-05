import { Logger } from '@nestjs/common';

import {
    ModelGatewayError,
    ModelRefusalError,
    OutOfCreditError,
    ProviderOutageError,
    UnparseableOutputError,
} from '../../../errors/model-gateway.errors.js';
import { CreditBalance, PromptMessage, TextStream } from '../model-gateway.js';
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

/** What one call billed. */
export interface TextBill {
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
}

export interface OpenRouterChatResult extends TextBill {
    text: string;
    finishReason: string | undefined;
}

export interface OpenRouterStreamResult extends OpenRouterChatResult {
    /** True when the caller aborted; usage is then 0 until `generation` reports the bill. */
    stopped: boolean;
    /** The `gen-…` id the chunks carry, for `generation`. */
    generationId: string | undefined;
}

/**
 * The `data` of each server-sent event, in order. Comment lines (OpenRouter's
 * `: OPENROUTER PROCESSING` keep-alives) and other fields are skipped.
 */
async function* serverSentData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
            let end: number;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
                const event = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                const data = event
                    .split('\n')
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).replace(/^ /, ''));
                if (data.length > 0) yield data.join('\n');
            }
        }
    } finally {
        await reader.cancel().catch(() => {});
    }
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
     * The same call as `chat`, streamed (https://openrouter.ai/docs/api-reference/streaming):
     * each content delta goes to `onText` as it arrives, and usage and cost come from the
     * stream's last chunk, which OpenRouter sends just before `[DONE]`. A 429 or 503 is
     * answered before any text, so `send` retries it as for a whole call. An error after
     * text has arrived comes as a chunk with `error` and `finish_reason: "error"` on an HTTP
     * 200, and is mapped the same way.
     *
     * Aborting `signal` closes the connection, which stops the model and its billing on hosts
     * that support cancellation (DeepInfra does; GMICloud is not listed either way). The call
     * then resolves with `stopped` and the text so far, but no usage: an aborted stream never
     * gets its usage chunk, so the caller reads the bill with `generation(generationId)`.
     */
    async chatStream(request: OpenRouterChatRequest, { onText, signal }: TextStream): Promise<OpenRouterStreamResult> {
        const stopped = (text: string, generationId: string | undefined): OpenRouterStreamResult => ({
            text,
            promptTokens: 0,
            completionTokens: 0,
            costUsd: 0,
            finishReason: undefined,
            stopped: true,
            generationId,
        });
        if (signal.aborted) return stopped('', undefined);

        const body = { ...OpenRouterClient.buildBody(request), stream: true };
        let response: Response;
        try {
            response = await this.send(
                '/chat/completions',
                {
                    method: 'POST',
                    headers: {
                        ...this.headers(),
                        'Content-Type': 'application/json',
                        Accept: 'text/event-stream',
                        'X-Title': 'Storytell AI',
                    },
                    body: JSON.stringify(body),
                    signal,
                },
                signal,
            );
        } catch (error) {
            if (signal.aborted) return stopped('', undefined);
            throw error;
        }
        if (signal.aborted) return stopped('', undefined);
        if (!response.ok || !response.body) {
            throw this.toError(response.status, await readJson(response));
        }

        let text = '';
        let generationId: string | undefined;
        let finishReason: string | undefined;
        let usage: Record<string, any> | undefined;
        try {
            for await (const data of serverSentData(response.body)) {
                if (data === '[DONE]') break;
                let chunk: Record<string, any>;
                try {
                    chunk = JSON.parse(data) as Record<string, any>;
                } catch {
                    throw new UnparseableOutputError(`${request.model.id} sent a stream chunk that is not JSON.`);
                }
                if (typeof chunk.id === 'string') generationId = chunk.id;
                if (chunk.error) throw this.toError(200, { error: chunk.error });
                const choice = chunk.choices?.[0];
                if (choice?.finish_reason === 'content_filter' || choice?.native_finish_reason === 'content_filter') {
                    throw new ModelRefusalError('The host stopped the output for content.');
                }
                finishReason = choice?.finish_reason ?? finishReason;
                const piece = choice?.delta?.content;
                if (typeof piece === 'string' && piece !== '') {
                    text += piece;
                    onText(piece);
                }
                if (chunk.usage) usage = chunk.usage;
                // Stop reading the moment the caller aborts, even mid-chunk.
                if (signal.aborted) return stopped(text, generationId);
            }
        } catch (error) {
            if (signal.aborted) return stopped(text, generationId);
            if (error instanceof ModelGatewayError) throw error;
            throw new ProviderOutageError(`The stream from OpenRouter broke off: ${(error as Error).message}`);
        }
        if (signal.aborted) return stopped(text, generationId);
        if (!usage) {
            throw new ProviderOutageError(`The stream from OpenRouter ended before ${request.model.id} finished.`);
        }
        if (typeof usage.cost !== 'number') {
            this.logger.warn(`OpenRouter reported no cost for ${request.model.id}; recording $0.`);
        }
        return {
            text,
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            costUsd: typeof usage.cost === 'number' ? usage.cost : 0,
            finishReason,
            stopped: false,
            generationId,
        };
    }

    /**
     * What one generation billed (https://openrouter.ai/docs/api-reference/get-a-generation),
     * read for a stream that was stopped and so never got its usage chunk. Undefined while
     * OpenRouter does not know the generation yet (a 404), which it answers for a moment
     * after the stream closes.
     */
    async generation(id: string): Promise<TextBill | undefined> {
        const response = await this.send(`/generation?id=${encodeURIComponent(id)}`, { method: 'GET', headers: this.headers() });
        const json = await readJson(response);
        if (response.status === 404) return undefined;
        if (!response.ok) throw this.toError(response.status, json);
        const data = json?.data ?? {};
        return {
            promptTokens: typeof data.tokens_prompt === 'number' ? data.tokens_prompt : 0,
            completionTokens: typeof data.tokens_completion === 'number' ? data.tokens_completion : 0,
            costUsd: typeof data.total_cost === 'number' ? data.total_cost : 0,
        };
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

    /**
     * Sends once, retrying only a 429 or 503 (answers given before any inference ran). An
     * aborted `signal` ends the retries: the caller then sees the abort.
     */
    private async send(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
        for (let attempt = 0; ; attempt++) {
            let response: Response;
            try {
                response = await sendRequest(this.fetchImpl, `${this.baseUrl}${path}`, init);
            } catch (error) {
                if (error instanceof NetworkError) throw new ProviderOutageError(error.message);
                throw error;
            }
            if (!isRetryable(response.status) || attempt >= MAX_RETRIES || signal?.aborted) return response;
            const delay = retryDelayMs(attempt, response.headers.get('retry-after'));
            this.logger.warn(`OpenRouter answered ${response.status} on ${path}; retrying in ${delay} ms`);
            await this.sleep(delay);
            if (signal?.aborted) return response;
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
        const described = `OpenRouter: ${message}${describeProvider(metadata)}`;

        // A 429 is a rate limit, OpenRouter's own or the host's (DeepInfra's engine_overloaded
        // is relayed this way), and a 503 is an overloaded host. Both are transient: `send`
        // retried them on the same host and gave up. Whatever metadata they carry, neither
        // means credit (https://openrouter.ai/docs/api-reference/limits documents
        // `limit_source` on 402 and 403 only), so they stay an outage.
        if (isRetryable(code) || isRetryable(status)) {
            return new ProviderOutageError(described);
        }
        // Credit: a 402 (balance, key limit or the per-request in-flight reservation) or a
        // 403 budget block, both of which name their `limit_source`. OpenRouter refuses with
        // the "exceed your available credits" message when the account can't cover one call.
        if (
            code === 402 ||
            metadata.error_type === 'payment_required' ||
            /exceed(s)? your available credits/i.test(message) ||
            /insufficient credits/i.test(message) ||
            typeof metadata.limit_source === 'string'
        ) {
            return new OutOfCreditError('text', described);
        }
        if (
            metadata.error_type === 'content_policy_violation' ||
            metadata.error_type === 'refusal' ||
            Array.isArray(metadata.reasons)
        ) {
            return new ModelRefusalError(described);
        }
        return new ProviderOutageError(described);
    }
}

/**
 * The host's own words, when OpenRouter relayed them: ` (DeepInfra: engine_overloaded)`.
 * `provider_code` is the host's error code; `raw` its verbatim payload, kept short.
 */
function describeProvider(metadata: Record<string, any>): string {
    const detail: string | undefined =
        typeof metadata.provider_code === 'string'
            ? metadata.provider_code
            : typeof metadata.raw === 'string'
              ? metadata.raw.slice(0, 200)
              : undefined;
    if (!detail) return '';
    const host = typeof metadata.provider_name === 'string' ? `${metadata.provider_name}: ` : '';
    return ` (${host}${detail})`;
}

function round(usd: number): number {
    return Math.round(usd * 1_000_000) / 1_000_000;
}

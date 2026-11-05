import { Logger } from '@nestjs/common';

import {
    ModelGatewayError,
    ModelRefusalError,
    OutOfCreditError,
    ProviderOutageError,
    UnparseableOutputError,
} from '../../../errors/model-gateway.errors.js';
import { CreditBalance, ImageData } from '../model-gateway.js';
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
import { ImageModelSpec } from './model-table.js';

export const VENICE_BASE_URL = 'https://api.venice.ai/api/v1';

/** Every image is a 2:3 portrait (spec: "Image generation ... the fixed 2:3 size"). */
export const IMAGE_ASPECT_RATIO = '2:3';

export interface VeniceImageRequest {
    model: ImageModelSpec;
    prompt: string;
    /** Input images for multi-edit: the first is the base, the rest are layers. */
    referenceImages?: ImageData[];
}

/**
 * Venice image calls. Request fields per https://docs.venice.ai/swagger.yaml
 * (GenerateImageRequest, MultiEditImageRequest) and the ticket 18 check
 * (prototypes/image-check/check.mjs). A 402 is out of image credit; a 422, a blurred result
 * or a content-violation result is a refusal.
 */
export class VeniceClient {
    private readonly logger = new Logger(VeniceClient.name);
    private promptLimits: Promise<Map<string, number>> | undefined;

    constructor(
        private readonly apiKey: string | undefined,
        private readonly adminKey: string | undefined,
        private readonly fetchImpl: FetchLike,
        private readonly sleep: SleepFn = defaultSleep,
        private readonly baseUrl = VENICE_BASE_URL,
    ) {}

    /** The JSON body an image request becomes. Exposed so contract tests can check it. */
    static buildBody(request: VeniceImageRequest, prompt: string): Record<string, unknown> {
        const { model } = request;
        if (model.endpoint === 'generate') {
            return {
                model: model.id,
                prompt,
                aspect_ratio: IMAGE_ASPECT_RATIO, // Qwen Image models reject width/height
                format: 'jpeg',
                safe_mode: false,
                hide_watermark: true,
                return_binary: false,
                variants: 1,
                ...(model.resolution ? { resolution: model.resolution } : {}),
            };
        }
        return {
            modelId: model.id,
            prompt,
            images: (request.referenceImages ?? []).map((image) => image.bytes.toString('base64')),
            aspect_ratio: IMAGE_ASPECT_RATIO,
            output_format: 'jpeg',
            safe_mode: false,
        };
    }

    async generate(request: VeniceImageRequest): Promise<ImageData> {
        const prompt = await this.fitPrompt(request.model, request.prompt);
        const body = VeniceClient.buildBody(request, prompt);
        const path = request.model.endpoint === 'generate' ? '/image/generate' : '/image/multi-edit';
        const response = await this.send(path, {
            method: 'POST',
            headers: { ...this.inferenceHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw this.toError(response.status, await readJson(response));
        }
        if (response.headers.get('x-venice-is-content-violation') === 'true') {
            throw new ModelRefusalError('Venice flagged the image as a content violation.');
        }
        if (response.headers.get('x-venice-is-blurred') === 'true') {
            throw new ModelRefusalError('Venice returned the image blurred.');
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.startsWith('image/')) {
            return {
                bytes: Buffer.from(await response.arrayBuffer()),
                mimeType: contentType.split(';')[0],
            };
        }
        const json = await readJson(response);
        const base64 = json?.images?.[0];
        if (typeof base64 !== 'string' || base64.length === 0) {
            if (Number(response.headers.get('x-venice-content-violation-count')) > 0) {
                throw new ModelRefusalError('Venice rejected the image under its content policy.');
            }
            throw new UnparseableOutputError(`${request.model.id} returned no image.`);
        }
        return { bytes: Buffer.from(base64, 'base64'), mimeType: 'image/jpeg' };
    }

    /**
     * Remaining image credit. `GET /billing/balance` answers only to an Admin key; without
     * one the balance is unknown and the usage view shows spend alone.
     */
    async credit(): Promise<CreditBalance> {
        if (!this.adminKey) return { remainingUsd: null, limitUsd: null };
        const response = await this.send('/billing/balance', {
            method: 'GET',
            headers: { Authorization: `Bearer ${this.adminKey}` },
        });
        const json = await readJson(response);
        if (!response.ok) throw this.toError(response.status, json);
        const usd = json?.balances?.usd;
        if (usd !== null && typeof usd !== 'number') {
            throw new UnparseableOutputError('Venice returned a balance that could not be read.');
        }
        // Null means zero. A prepaid balance has no cap to report.
        return { remainingUsd: Math.max(0, usd ?? 0), limitUsd: null };
    }

    /**
     * Prompt limits differ by model (1500 characters for qwen-edit-uncensored). They are read
     * once from `GET /models`, and a longer prompt is cut to fit rather than refused.
     */
    private async fitPrompt(model: ImageModelSpec, prompt: string): Promise<string> {
        const limit = (await this.promptLimit(model)) ?? model.fallbackPromptCharacterLimit;
        if (prompt.length <= limit) return prompt;
        this.logger.warn(`Prompt of ${prompt.length} characters cut to ${limit} for ${model.id}.`);
        return prompt.slice(0, limit);
    }

    private async promptLimit(model: ImageModelSpec): Promise<number | undefined> {
        this.promptLimits ??= this.loadPromptLimits().catch((error: Error) => {
            this.logger.warn(`Could not read Venice model limits (${error.message}); using fallbacks.`);
            this.promptLimits = undefined; // try again on the next call
            return new Map<string, number>();
        });
        return (await this.promptLimits).get(model.id);
    }

    private async loadPromptLimits(): Promise<Map<string, number>> {
        const limits = new Map<string, number>();
        // Edit models are listed under `inpaint`, generation models under `image`.
        for (const type of ['image', 'inpaint']) {
            const response = await sendRequest(this.fetchImpl, `${this.baseUrl}/models?type=${type}`, {
                method: 'GET',
                headers: this.inferenceHeaders(),
            });
            const json = await readJson(response);
            if (!response.ok || !Array.isArray(json?.data)) {
                throw new Error(`GET /models?type=${type} answered ${response.status}`);
            }
            for (const entry of json.data) {
                const limit = entry?.model_spec?.constraints?.promptCharacterLimit;
                if (typeof entry?.id === 'string' && typeof limit === 'number') {
                    limits.set(entry.id, limit);
                }
            }
        }
        return limits;
    }

    private inferenceHeaders(): Record<string, string> {
        if (!this.apiKey) throw new ProviderOutageError('VENICE_API_KEY is not set.');
        return { Authorization: `Bearer ${this.apiKey}` };
    }

    /** Retries a 429 or 503 on the same model; both are refused before inference, so never billed. */
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
            this.logger.warn(`Venice answered ${response.status} on ${path}; retrying in ${delay} ms`);
            await this.sleep(delay);
        }
    }

    private toError(status: number, json: Record<string, any> | undefined): ModelGatewayError {
        const detail = typeof json?.error === 'string' ? json.error : `HTTP ${status}`;
        const details = json?.details ? ` ${JSON.stringify(json.details)}` : '';
        if (status === 402) return new OutOfCreditError('image', `Venice: ${detail}`);
        if (status === 422) return new ModelRefusalError(`Venice: ${detail}`);
        return new ProviderOutageError(`Venice: ${detail}${details}`);
    }
}

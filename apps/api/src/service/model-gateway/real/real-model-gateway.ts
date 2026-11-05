import { Logger } from '@nestjs/common';

import { ModelGatewayError } from '../../../errors/model-gateway.errors.js';
import {
    BACKGROUND_MODEL,
    CallKind,
    CreditBalance,
    CreditPool,
    ImageGenerationRequest,
    ImageGenerationResult,
    MAX_REFERENCE_IMAGES,
    ModelGateway,
    PlayModel,
    RemainingCredit,
    SnapshotModel,
    TextCompletionRequest,
    TextCompletionResult,
    TextStream,
    TextModel,
    TextStreamResult,
} from '../model-gateway.js';
import { IMAGE_MODELS, imageModelForKind, isPlayModelKind, TEXT_MODELS, VENICE_HOST } from './model-table.js';
import { defaultSleep, SleepFn } from './http.js';
import { OpenRouterChatRequest, OpenRouterClient, TextBill } from './openrouter-client.js';
import { VeniceClient } from './venice-client.js';

/** The two Settings the gateway reads before each call. */
export interface GatewayModelSettings {
    playModel: PlayModel;
    imageModel: SnapshotModel;
}

export interface NewUsageRecord {
    kind: CallKind;
    pool: CreditPool;
    model: string;
    host: string;
    promptTokens: number | null;
    completionTokens: number | null;
    images: number | null;
    costUsd: number;
    storyId: number | null;
    chatId: number | null;
}

export interface RealModelGatewayDeps {
    openRouter: OpenRouterClient;
    venice: VeniceClient;
    settings: { current(): Promise<GatewayModelSettings> };
    usage: { record(record: NewUsageRecord): Promise<void> };
    /** How long a credit reading is reused, so the banner doesn't hit the providers per page. */
    creditCacheMs?: number;
    /** How a stopped generation's bill lookup waits between tries. */
    sleep?: SleepFn;
}

/** How many times a stopped generation's bill is asked for: about 30 s with the backoff. */
const GENERATION_LOOKUPS = 5;

/**
 * The gateway bound when MODEL_GATEWAY=real. It picks the model from the call kind and
 * Settings, sends through the pinned provider client, and writes one UsageRecord per call
 * that was answered (a refused or failed call is not billed, so none is written for it).
 */
export class RealModelGateway extends ModelGateway {
    private readonly logger = new Logger(RealModelGateway.name);
    private readonly creditCacheMs: number;
    private readonly sleep: SleepFn;
    private creditCache: { readAt: number; credit: RemainingCredit } | undefined;

    constructor(private readonly deps: RealModelGatewayDeps) {
        super();
        this.creditCacheMs = deps.creditCacheMs ?? 30_000;
        this.sleep = deps.sleep ?? defaultSleep;
    }

    async completeText(request: TextCompletionRequest): Promise<TextCompletionResult> {
        const { modelName, chat } = await this.textCall(request);
        const result = await this.deps.openRouter.chat(chat);
        await this.recordText(request, modelName, result);
        return {
            text: result.text,
            model: modelName,
            usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
            costUsd: result.costUsd,
        };
    }

    /**
     * A turn streamed through OpenRouter. A finished stream is recorded as `completeText`
     * records a call. A stopped one has no usage chunk, so its bill is read from OpenRouter's
     * generation endpoint in the background, once OpenRouter knows it, and recorded then:
     * the caller does not wait for it. A stream stopped before its first chunk carries no
     * generation id to look up, so nothing is recorded for it.
     */
    async streamText(request: TextCompletionRequest, stream: TextStream): Promise<TextStreamResult> {
        const { modelName, chat } = await this.textCall(request);
        const result = await this.deps.openRouter.chatStream(chat, stream);
        if (!result.stopped) {
            await this.recordText(request, modelName, result);
        } else if (result.generationId) {
            const generationId = result.generationId;
            void this.billOf(generationId)
                .then((bill) => (bill ? this.recordText(request, modelName, bill) : undefined))
                .catch((error: unknown) =>
                    this.logger.warn(`Could not record the stopped generation ${generationId}: ${(error as Error).message}`),
                );
        }
        return {
            text: result.text,
            model: modelName,
            usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
            costUsd: result.costUsd,
            stopped: result.stopped,
        };
    }

    /** The model a text call runs on, from its kind and Settings, and the request OpenRouter gets. */
    private async textCall(request: TextCompletionRequest): Promise<{ modelName: TextModel; chat: OpenRouterChatRequest }> {
        const modelName: TextModel = isPlayModelKind(request.kind)
            ? (await this.deps.settings.current()).playModel
            : BACKGROUND_MODEL;
        const { messages, maxTokens, json, stop } = request;
        return { modelName, chat: { model: TEXT_MODELS[modelName], messages, maxTokens, json, stop } };
    }

    /** One text-pool UsageRecord for what a call billed. */
    private recordText(request: TextCompletionRequest, modelName: TextModel, bill: TextBill): Promise<void> {
        return this.deps.usage.record({
            kind: request.kind,
            pool: 'text',
            model: modelName,
            host: TEXT_MODELS[modelName].host,
            promptTokens: bill.promptTokens,
            completionTokens: bill.completionTokens,
            images: null,
            costUsd: bill.costUsd,
            storyId: request.servedFor?.storyId ?? null,
            chatId: request.servedFor?.chatId ?? null,
        });
    }

    /** A generation's bill, asked for until OpenRouter knows it (it 404s for a moment after a stream closes). */
    private async billOf(generationId: string): Promise<TextBill | undefined> {
        for (let attempt = 0; attempt < GENERATION_LOOKUPS; attempt++) {
            const bill = await this.deps.openRouter.generation(generationId);
            if (bill) return bill;
            await this.sleep(1000 * 2 ** attempt);
        }
        this.logger.warn(`OpenRouter never reported the stopped generation ${generationId}; its cost is not recorded.`);
        return undefined;
    }

    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        const referenceCount = request.referenceImages?.length ?? 0;
        if (referenceCount > MAX_REFERENCE_IMAGES) {
            throw new RangeError(`At most ${MAX_REFERENCE_IMAGES} reference images, got ${referenceCount}`);
        }
        const modelName = imageModelForKind(
            request.kind,
            (await this.deps.settings.current()).imageModel,
            referenceCount,
        );
        const model = IMAGE_MODELS[modelName];

        const image = await this.deps.venice.generate({
            model,
            prompt: request.prompt,
            referenceImages: request.referenceImages,
        });

        await this.deps.usage.record({
            kind: request.kind,
            pool: 'image',
            model: modelName,
            host: VENICE_HOST,
            promptTokens: null,
            completionTokens: null,
            images: 1,
            costUsd: model.listPriceUsd,
            storyId: request.servedFor?.storyId ?? null,
            chatId: request.servedFor?.chatId ?? null,
        });

        return { image, model: modelName, costUsd: model.listPriceUsd };
    }

    async remainingCredit(): Promise<RemainingCredit> {
        const now = Date.now();
        if (this.creditCache && now - this.creditCache.readAt < this.creditCacheMs) {
            return structuredClone(this.creditCache.credit);
        }
        const [text, image] = await Promise.all([
            this.readCredit('text', () => this.deps.openRouter.credit()),
            this.readCredit('image', () => this.deps.venice.credit()),
        ]);
        const credit = { text, image };
        this.creditCache = { readAt: now, credit };
        return structuredClone(credit);
    }

    /** A provider that can't be asked leaves its pool unknown rather than failing the view. */
    private async readCredit(pool: CreditPool, read: () => Promise<CreditBalance>): Promise<CreditBalance> {
        try {
            return await read();
        } catch (error) {
            if (error instanceof ModelGatewayError) {
                this.logger.warn(`Could not read ${pool} credit: ${error.message}`);
                return { remainingUsd: null, limitUsd: null };
            }
            throw error;
        }
    }
}

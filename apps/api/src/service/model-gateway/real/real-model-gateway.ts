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
} from '../model-gateway.js';
import { IMAGE_MODELS, imageModelForKind, isPlayModelKind, TEXT_MODELS, VENICE_HOST } from './model-table.js';
import { OpenRouterClient } from './openrouter-client.js';
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
}

/**
 * The gateway bound when MODEL_GATEWAY=real. It picks the model from the call kind and
 * Settings, sends through the pinned provider client, and writes one UsageRecord per call
 * that was answered (a refused or failed call is not billed, so none is written for it).
 */
export class RealModelGateway extends ModelGateway {
    private readonly logger = new Logger(RealModelGateway.name);
    private readonly creditCacheMs: number;
    private creditCache: { readAt: number; credit: RemainingCredit } | undefined;

    constructor(private readonly deps: RealModelGatewayDeps) {
        super();
        this.creditCacheMs = deps.creditCacheMs ?? 30_000;
    }

    async completeText(request: TextCompletionRequest): Promise<TextCompletionResult> {
        const modelName = isPlayModelKind(request.kind)
            ? (await this.deps.settings.current()).playModel
            : BACKGROUND_MODEL;
        const model = TEXT_MODELS[modelName];

        const result = await this.deps.openRouter.chat({
            model,
            messages: request.messages,
            maxTokens: request.maxTokens,
            json: request.json,
            stop: request.stop,
        });

        await this.deps.usage.record({
            kind: request.kind,
            pool: 'text',
            model: modelName,
            host: model.host,
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            images: null,
            costUsd: result.costUsd,
            storyId: request.servedFor?.storyId ?? null,
            chatId: request.servedFor?.chatId ?? null,
        });

        return {
            text: result.text,
            model: modelName,
            usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
            costUsd: result.costUsd,
        };
    }

    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        const referenceCount = request.referenceImages?.length ?? 0;
        if (referenceCount > MAX_REFERENCE_IMAGES) {
            throw new RangeError(`At most ${MAX_REFERENCE_IMAGES} reference images, got ${referenceCount}`);
        }
        const modelName = imageModelForKind(request.kind, (await this.deps.settings.current()).imageModel);
        const model = IMAGE_MODELS[modelName];
        if (model.endpoint === 'multi-edit' && referenceCount === 0) {
            throw new RangeError(`${modelName} edits a reference image, but none was given`);
        }

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

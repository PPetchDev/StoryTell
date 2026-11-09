import { Logger } from '@nestjs/common';

import { ModelGatewayError, ProviderBusyError, ProviderOutageError } from '../../../errors/model-gateway.errors.js';
import {
    BACKGROUND_FALLBACK_MODEL,
    BACKGROUND_MODEL,
    CallKind,
    CreditBalance,
    CreditPool,
    EMBEDDING_MODEL,
    EmbeddingRequest,
    EmbeddingResult,
    ImageGenerationRequest,
    ImageGenerationResult,
    MAX_REFERENCE_IMAGES,
    ModelGateway,
    PlayModel,
    playModelName,
    PlaySamplers,
    RemainingCredit,
    SnapshotModel,
    SnapshotSize,
    englishVoice,
    SPEECH_MODEL,
    SpeechRequest,
    SpeechResult,
    SpeechVoice,
    TextCompletionRequest,
    TextCompletionResult,
    TextStream,
    TextModel,
    TextStreamResult,
    TRANSCRIPTION_MODEL,
    TranscriptionRequest,
    TranscriptionResult,
} from '../model-gateway.js';
import {
    drawnSize,
    EMBEDDING_MODELS,
    IMAGE_MODELS,
    imageModelForKind,
    ImageModelSpec,
    isPlayModelKind,
    isSampledKind,
    SPEECH_MODELS,
    TEXT_MODELS,
    TRANSCRIPTION_MODELS,
    VENICE_HOST,
} from './model-table.js';
import { defaultSleep, SleepFn } from './http.js';
import {
    OpenRouterChatRequest,
    OpenRouterChatResult,
    OpenRouterClient,
    SamplerRefusedError,
    TextBill,
} from './openrouter-client.js';
import { VeniceClient } from './venice-client.js';

/** The Settings the gateway reads before each call. */
export interface GatewayModelSettings {
    playModel: PlayModel;
    imageModel: SnapshotModel;
    snapshotSize: SnapshotSize;
    /** Sampling per play model; only the current play model's values are ever read. */
    samplers: PlaySamplers;
}

export interface NewUsageRecord {
    kind: CallKind;
    pool: CreditPool;
    model: string;
    host: string;
    promptTokens: number | null;
    completionTokens: number | null;
    images: number | null;
    /** Characters sent, for speech; left out (null) for every other kind. */
    characters?: number | null;
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

    /**
     * A background call whose model's host stays busy through every retry goes once more to
     * BACKGROUND_FALLBACK_MODEL on the same host; the result and its UsageRecord name the model
     * that answered. Play calls never switch model on their own.
     */
    async completeText(request: TextCompletionRequest): Promise<TextCompletionResult> {
        let { modelName, chat } = await this.textCall(request);
        let result: OpenRouterChatResult;
        try {
            result = await this.deps.openRouter.chat(chat);
        } catch (error) {
            if (!(error instanceof ProviderBusyError) || modelName !== BACKGROUND_MODEL) throw forUser(error, modelName);
            this.logger.warn(
                `${request.kind} on ${BACKGROUND_MODEL} stayed busy (${error.message}); sending it to ${BACKGROUND_FALLBACK_MODEL}.`,
            );
            modelName = BACKGROUND_FALLBACK_MODEL;
            chat = { ...chat, model: TEXT_MODELS[modelName] };
            result = await this.deps.openRouter.chat(chat);
        }
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
        const result = await this.deps.openRouter.chatStream(chat, stream).catch((error: unknown) => {
            throw forUser(error, modelName);
        });
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
        const { messages, maxTokens, json, stop } = request;
        if (!isPlayModelKind(request.kind)) {
            return { modelName: BACKGROUND_MODEL, chat: { model: TEXT_MODELS[BACKGROUND_MODEL], messages, maxTokens, json, stop } };
        }
        const settings = await this.deps.settings.current();
        const modelName = settings.playModel;
        // Only the current play model's values, and only on a sampled kind.
        const samplers = isSampledKind(request.kind) ? settings.samplers[modelName] : undefined;
        return {
            modelName,
            chat: { model: TEXT_MODELS[modelName], messages, maxTokens, json, stop, ...(samplers ? { samplers } : {}) },
        };
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

    /**
     * Vectors from the embedding model, pinned to its host. One text-pool UsageRecord per call,
     * with the cost OpenRouter reports, or the list price times the prompt tokens when it
     * reports none.
     */
    async embedTexts(request: EmbeddingRequest): Promise<EmbeddingResult> {
        if (request.inputs.length === 0) throw new RangeError('embedTexts needs at least one input');
        const modelName = EMBEDDING_MODEL;
        const model = EMBEDDING_MODELS[modelName];
        const result = await this.deps.openRouter.embed({ model, inputs: request.inputs });
        // Whole billionths of a dollar: a search is about $0.000005.
        const costUsd = result.costUsd ?? Math.round(result.promptTokens * model.priceUsdPerMillion * 1e3) / 1e9;
        await this.deps.usage.record({
            kind: request.kind,
            pool: 'text',
            model: modelName,
            host: model.host,
            promptTokens: result.promptTokens,
            completionTokens: 0,
            images: null,
            costUsd,
            storyId: request.servedFor?.storyId ?? null,
            chatId: request.servedFor?.chatId ?? null,
        });
        return { vectors: result.vectors, model: modelName, usage: { promptTokens: result.promptTokens }, costUsd };
    }

    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        const referenceCount = request.referenceImages?.length ?? 0;
        if (referenceCount > MAX_REFERENCE_IMAGES) {
            throw new RangeError(`At most ${MAX_REFERENCE_IMAGES} reference images, got ${referenceCount}`);
        }
        const settings = await this.deps.settings.current();
        const modelName = imageModelForKind(request.kind, settings.imageModel, referenceCount);
        const model = IMAGE_MODELS[modelName];
        // Reference images ask for 2K, Expressions for 1K (their price in the editor), Snapshots for the Settings size.
        const wanted = request.kind === 'reference_image' ? '2K' : request.kind === 'expression_image' ? '1K' : settings.snapshotSize;
        const size = drawnSize(model, wanted);

        const image = await this.deps.venice.generate({
            model,
            prompt: request.prompt,
            referenceImages: request.referenceImages,
            ...(size === '2K' ? { resolution: '2K' as const } : {}),
        });
        const costUsd = imageListPrice(model, size, referenceCount);

        await this.deps.usage.record({
            kind: request.kind,
            pool: 'image',
            model: modelName,
            host: VENICE_HOST,
            promptTokens: null,
            completionTokens: null,
            images: 1,
            costUsd,
            storyId: request.servedFor?.storyId ?? null,
            chatId: request.servedFor?.chatId ?? null,
        });

        return { image, model: modelName, costUsd };
    }

    /**
     * Whisper on Venice, in the language asked for. One Venice-pool UsageRecord per answered
     * call at list price: Venice reports no cost, so it is the audio's length (Venice's when it
     * reports one, else the browser's) in whole seconds, clamped to 1–120.
     */
    async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
        const modelName = TRANSCRIPTION_MODEL;
        const model = TRANSCRIPTION_MODELS[modelName];
        const answer = await this.deps.venice.transcribe({ modelId: model.id, audio: request.audio, language: request.language });
        const seconds = Math.min(120, Math.max(1, Math.ceil(answer.durationSeconds ?? request.durationSeconds)));
        // Whole millionths of a dollar, so 13 s records as 0.0013.
        const costUsd = Math.round(seconds * model.priceUsdPerSecond * 1e6) / 1e6;

        await this.deps.usage.record({
            kind: request.kind,
            pool: 'image',
            model: modelName,
            host: VENICE_HOST,
            promptTokens: null,
            completionTokens: null,
            images: null,
            costUsd,
            storyId: request.servedFor?.storyId ?? null,
            chatId: request.servedFor?.chatId ?? null,
        });
        return { text: answer.text.trim(), model: modelName, costUsd };
    }

    /**
     * Kokoro on Venice. One Venice-pool UsageRecord per answered call at list price: Venice
     * reports no cost, so it is the characters sent times `pricing.input` (or the stored price
     * when the models list can't be read), in whole millionths of a dollar.
     */
    async synthesizeSpeech(request: SpeechRequest): Promise<SpeechResult> {
        const modelName = SPEECH_MODEL;
        const model = SPEECH_MODELS[modelName];
        const characters = request.text.length;
        if (characters === 0 || characters > model.requestCharacterLimit) {
            throw new RangeError(`Speech text must be 1 to ${model.requestCharacterLimit} characters, got ${characters}`);
        }
        const listed = await this.deps.venice.speechModel(model.id);
        const priceUsdPerMillion = listed?.priceUsdPerMillion ?? model.fallbackPriceUsdPerMillion;
        const bytes = await this.deps.venice.speak({ modelId: model.id, input: request.text, voice: request.voice });
        const costUsd = Math.round(characters * priceUsdPerMillion) / 1e6;

        await this.deps.usage.record({
            kind: request.kind,
            pool: 'image',
            model: modelName,
            host: VENICE_HOST,
            promptTokens: null,
            completionTokens: null,
            images: null,
            characters,
            costUsd,
            storyId: request.servedFor?.storyId ?? null,
            chatId: request.servedFor?.chatId ?? null,
        });
        return { audio: { bytes, mimeType: 'audio/mpeg' }, model: modelName, characters, costUsd };
    }

    /** The English voices Venice lists for Kokoro, or the stored ones when the list can't be read. */
    async speechVoices(): Promise<SpeechVoice[]> {
        const model = SPEECH_MODELS[SPEECH_MODEL];
        const ids = (await this.deps.venice.speechModel(model.id))?.voices ?? model.fallbackVoices;
        return ids.flatMap((id) => englishVoice(id) ?? []);
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

/** A host refusing a Sampling value, worded so the user knows what to do about it. */
function forUser(error: unknown, modelName: TextModel): unknown {
    if (!(error instanceof SamplerRefusedError)) return error;
    return new ProviderOutageError(
        `DeepInfra no longer takes one of the Sampling values for ${playModelName(modelName)}. Reset Sampling for it in Settings.`,
    );
}

/** An image's list price: the model's price, plus each input image past the first where the model charges for them. */
function imageListPrice(model: ImageModelSpec, size: SnapshotSize, inputImages: number): number {
    const extra = (model.extraInputImageUsd ?? 0) * Math.max(0, inputImages - 1);
    // Whole millionths of a dollar, so $0.06 + 2 × $0.00345 records as 0.0669 and not 0.06690000000000001.
    return Math.round(((model.prices[size] ?? model.prices['1K']) + extra) * 1e6) / 1e6;
}

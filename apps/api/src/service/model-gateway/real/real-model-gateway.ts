import { Logger } from '@nestjs/common';

import {
    ModelGatewayError,
    NoEmbeddingCreditError,
    OutOfCreditError,
    ProviderBusyError,
    ProviderOutageError,
} from '../../../errors/model-gateway.errors.js';
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
    IMAGE_CUTOUT_MODEL,
    IMAGE_CUTOUT_PRICE_USD,
    MAX_REFERENCE_IMAGES,
    ModelGateway,
    isPlayModel,
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
    DubVoices,
    DUB_SPEECH_MODEL,
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
    backgroundSamplers,
    drawnSize,
    imageListPrice,
    EMBEDDING_MODELS,
    IMAGE_MODELS,
    imageModelForKind,
    isPlayModelKind,
    isSampledKind,
    SPEECH_MODELS,
    TEXT_MODELS,
    TRANSCRIPTION_MODELS,
    VENICE_HOST,
} from './model-table.js';
import { defaultSleep, SleepFn } from './http.js';
import { OpenRouterChatRequest, OpenRouterChatResult, SamplerRefusedError, TextBill } from './openrouter-client.js';
import { TextHost } from './text-hosts.js';
import { VeniceClient } from './venice-client.js';

/** How long a host that answered out of credit is passed over for the next one (.scratch/text-fallback/spec.md). */
export const OUT_OF_CREDIT_SKIP_MS = 10 * 60_000;

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
    /** Of the prompt tokens, those the host read from its cache; left out (null) when it reported none. */
    cachedTokens?: number | null;
    images: number | null;
    /** Characters sent, for speech; left out (null) for every other kind. */
    characters?: number | null;
    costUsd: number;
    storyId: number | null;
    chatId: number | null;
    /** The AI Message the call served (.scratch/cost-view/spec.md); left out (null) for a call that served none. */
    messageId?: number | null;
}

export interface RealModelGatewayDeps {
    /**
     * The hosts text and embeddings go to, in the order they are tried (.scratch/text-fallback/spec.md).
     * At least one; OpenRouter alone by default.
     */
    textHosts: TextHost[];
    venice: VeniceClient;
    settings: { current(): Promise<GatewayModelSettings> };
    usage: { record(record: NewUsageRecord): Promise<void> };
    /** How long a credit reading is reused, so the banner doesn't hit the providers per page. */
    creditCacheMs?: number;
    /** How a stopped generation's bill lookup waits between tries. */
    sleep?: SleepFn;
    /** How long a host that answered out of credit is passed over; OUT_OF_CREDIT_SKIP_MS by default. */
    outOfCreditSkipMs?: number;
    /** The clock the out-of-credit memory reads; tests move it. */
    now?: () => number;
}

/** How many times a stopped generation's bill is asked for: about 30 s with the backoff. */
const GENERATION_LOOKUPS = 5;

/**
 * The gateway bound when MODEL_GATEWAY=real. It picks the model from the call kind and
 * Settings, sends through the pinned provider client, and writes one UsageRecord per call
 * that was answered (a refused or failed call is not billed, so none is written for it).
 */
/** Kokoro's Japanese voices on Venice, read on 2026-11-19, for when its list can't be read. */
const JAPANESE_NARRATION_FALLBACK = ['jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro', 'jm_kumo'] as const;

export class RealModelGateway extends ModelGateway {
    private readonly logger = new Logger(RealModelGateway.name);
    private readonly creditCacheMs: number;
    private readonly sleep: SleepFn;
    private creditCache: { readAt: number; credit: RemainingCredit } | undefined;
    private readonly outOfCreditSkipMs: number;
    private readonly now: () => number;
    /** Each host that answered out of credit, and until when it is passed over. */
    private readonly outUntil = new Map<TextHost['name'], number>();
    /** Each host's last balance reading, reused for `creditCacheMs`; a reading in flight is shared. */
    private readonly hostCredit = new Map<TextHost['name'], { readAt: number; reading: Promise<CreditBalance> }>();
    /** Each host passed over for a balance at or below zero, and until when that is not logged again. */
    private readonly usedUpLoggedUntil = new Map<TextHost['name'], number>();

    constructor(private readonly deps: RealModelGatewayDeps) {
        super();
        if (deps.textHosts.length === 0) throw new RangeError('The gateway needs at least one text host.');
        this.creditCacheMs = deps.creditCacheMs ?? 30_000;
        this.sleep = deps.sleep ?? defaultSleep;
        this.outOfCreditSkipMs = deps.outOfCreditSkipMs ?? OUT_OF_CREDIT_SKIP_MS;
        this.now = deps.now ?? Date.now;
    }

    /**
     * A text call, on the first host of the chain that answers it (`onHosts`). A background call
     * whose model's host stays busy through every retry goes once more to BACKGROUND_FALLBACK_MODEL
     * on the same host; the result and its UsageRecord name the model that answered. Play calls
     * never switch model on their own.
     */
    async completeText(request: TextCompletionRequest): Promise<TextCompletionResult> {
        const { modelName: asked, chat } = await this.textCall(request);
        const { result: answer, host } = await this.onHosts(request.kind, this.deps.textHosts, (host) => this.chatOn(host, request, asked, chat));
        const { modelName, result } = answer;
        await this.recordText(request, modelName, result, host);
        return {
            text: result.text,
            model: modelName,
            usage: { promptTokens: result.promptTokens, completionTokens: result.completionTokens },
            costUsd: result.costUsd,
        };
    }

    /** One host's answer to a text call, with the busy background model's one fallback on that host. */
    private async chatOn(
        host: TextHost,
        request: TextCompletionRequest,
        modelName: TextModel,
        chat: OpenRouterChatRequest,
    ): Promise<{ modelName: TextModel; result: OpenRouterChatResult }> {
        try {
            return { modelName, result: await host.client.chat(chat) };
        } catch (error) {
            // A host with its own model (the free one) has no other model to send it to.
            if (!(error instanceof ProviderBusyError) || modelName !== BACKGROUND_MODEL || host.ownModel) throw forUser(error, modelName);
            this.logger.warn(
                `${request.kind} on ${BACKGROUND_MODEL} stayed busy (${error.message}); sending it to ${BACKGROUND_FALLBACK_MODEL}.`,
            );
            const fallback = BACKGROUND_FALLBACK_MODEL;
            return { modelName: fallback, result: await host.client.chat({ ...chat, model: TEXT_MODELS[fallback] }) };
        }
    }

    /**
     * Runs a call on the chain of hosts (.scratch/text-fallback/spec.md). A host that answers out
     * of credit is remembered for `outOfCreditSkipMs`, and the call goes once to the next host, with
     * the same request, if `mayMoveOn` still allows it. A remembered host is passed over while a
     * host follows it, and so is one whose balance reads at or below zero, before anything is sent
     * to it; the last host is always tried, so a chain of one behaves as before the chain.
     */
    private async onHosts<T>(
        what: string,
        hosts: TextHost[],
        call: (host: TextHost) => Promise<T>,
        mayMoveOn: () => boolean = () => true,
    ): Promise<{ result: T; host: TextHost }> {
        const tried = hosts.filter((host, at) => at === hosts.length - 1 || !this.isOutOfCredit(host));
        for (let at = 0; ; at++) {
            const host = tried[at];
            const following = tried[at + 1];
            // A host below zero may still serve small calls on credit it doesn't have (OpenRouter does), so its balance is read first.
            if (following && (await this.readsUsedUp(what, host, following))) continue;
            try {
                const result = await call(host);
                this.outUntil.delete(host.name);
                return { result, host };
            } catch (error) {
                if (!(error instanceof OutOfCreditError)) throw error;
                this.rememberOutOfCredit(host);
                const next = tried[at + 1];
                if (!next || !mayMoveOn()) throw error;
                this.logger.warn(
                    `${what}: skipped ${host.name}, out of credit (${error.message}); sending it to ${next.name}, and passing ${host.name} over for ${Math.round(this.outOfCreditSkipMs / 60_000)} min.`,
                );
            }
        }
    }

    private isOutOfCredit(host: TextHost): boolean {
        return (this.outUntil.get(host.name) ?? 0) > this.now();
    }

    /**
     * Whether a host's balance reads at or below zero, so a call passes it over for `next` without
     * asking it. An unknown balance never does. Logged once per host per `outOfCreditSkipMs` while
     * it stays used up, and again after a reading above zero.
     */
    private async readsUsedUp(what: string, host: TextHost, next: TextHost): Promise<boolean> {
        const { remainingUsd } = await this.creditOf(host);
        if (remainingUsd === null || remainingUsd > 0) {
            this.usedUpLoggedUntil.delete(host.name);
            return false;
        }
        if ((this.usedUpLoggedUntil.get(host.name) ?? 0) <= this.now()) {
            this.usedUpLoggedUntil.set(host.name, this.now() + this.outOfCreditSkipMs);
            this.logger.warn(
                `${what}: passing ${host.name} over, its balance reads ${remainingUsd < 0 ? '-' : ''}$${Math.abs(remainingUsd)} (at or below zero); sending calls to ${next.name} until it reads above zero. Said once per ${Math.round(this.outOfCreditSkipMs / 60_000)} min.`,
            );
        }
        return true;
    }

    /** A host's balance, read at most once per `creditCacheMs`: the up-front skip and the text pool share it. */
    private creditOf(host: TextHost): Promise<CreditBalance> {
        const cached = this.hostCredit.get(host.name);
        if (cached && this.now() - cached.readAt < this.creditCacheMs) return cached.reading;
        const reading = this.readCredit('text', () => host.credit());
        const entry = { readAt: this.now(), reading };
        this.hostCredit.set(host.name, entry);
        // Only a provider error is read as unknown; anything else fails this call and is read again next time.
        reading.catch(() => {
            if (this.hostCredit.get(host.name) === entry) this.hostCredit.delete(host.name);
        });
        return reading;
    }

    private rememberOutOfCredit(host: TextHost): void {
        this.outUntil.set(host.name, this.now() + this.outOfCreditSkipMs);
        // The text pool may now read from the next host.
        this.creditCache = undefined;
    }

    /**
     * A turn streamed, on the first host of the chain that answers it: a host that refuses for
     * credit before any text has streamed passes it to the next; once text has streamed, never.
     * A finished stream is recorded as `completeText` records a call. A stopped one has no usage
     * chunk, so on OpenRouter its bill is read from the generation endpoint in the background,
     * once OpenRouter knows it, and recorded then: the caller does not wait for it. A stream
     * stopped before its first chunk carries no generation id to look up, so nothing is recorded
     * for it; nor is one stopped on Venice, which has no such lookup, or on the free model.
     */
    async streamText(request: TextCompletionRequest, stream: TextStream): Promise<TextStreamResult> {
        const { modelName, chat } = await this.textCall(request);
        let streamed = false;
        const watched: TextStream = {
            ...stream,
            onText: (piece) => {
                streamed = true;
                stream.onText(piece);
            },
        };
        const { result, host } = await this.onHosts(
            request.kind,
            this.deps.textHosts,
            (host) =>
                host.client.chatStream(chat, watched).catch((error: unknown) => {
                    throw forUser(error, modelName);
                }),
            () => !streamed && !stream.signal.aborted,
        );
        if (!result.stopped) {
            await this.recordText(request, modelName, result, host);
        } else if (result.generationId && host.looksUpStoppedBills) {
            const generationId = result.generationId;
            void this.billOf(host, generationId)
                .then((bill) => (bill ? this.recordText(request, modelName, bill, host) : undefined))
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
            const samplers = backgroundSamplers(request.kind);
            return {
                modelName: BACKGROUND_MODEL,
                chat: { model: TEXT_MODELS[BACKGROUND_MODEL], messages, maxTokens, json, stop, ...(samplers ? { samplers } : {}) },
            };
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

    /** One text-pool UsageRecord for what a call billed, naming the host (and its own model, if it has one) that answered. */
    private recordText(request: TextCompletionRequest, modelName: TextModel, bill: TextBill, host: TextHost): Promise<void> {
        return this.deps.usage.record({
            kind: request.kind,
            pool: 'text',
            model: host.ownModel ?? modelName,
            host: host.recordedHost ?? TEXT_MODELS[modelName].host,
            promptTokens: bill.promptTokens,
            completionTokens: bill.completionTokens,
            cachedTokens: bill.cachedTokens ?? null,
            images: null,
            costUsd: bill.costUsd,
            storyId: request.servedFor?.storyId ?? null,
            chatId: request.servedFor?.chatId ?? null,
            messageId: request.servedFor?.messageId ?? null,
        });
    }

    /** A generation's bill, asked for until OpenRouter knows it (it 404s for a moment after a stream closes). */
    private async billOf(host: TextHost, generationId: string): Promise<TextBill | undefined> {
        for (let attempt = 0; attempt < GENERATION_LOOKUPS; attempt++) {
            const bill = await host.client.generation(generationId);
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
    embeddingModel(): string {
        return EMBEDDING_MODEL;
    }

    async embedTexts(request: EmbeddingRequest): Promise<EmbeddingResult> {
        if (request.inputs.length === 0) throw new RangeError('embedTexts needs at least one input');
        const modelName = EMBEDDING_MODEL;
        const model = EMBEDDING_MODELS[modelName];
        const hosts = this.deps.textHosts.filter((host) => host.embeds);
        // Only the free model in the chain: nothing can embed, which a turn's search survives.
        if (hosts.length === 0) throw new NoEmbeddingCreditError('No host in TEXT_HOSTS has an embedding model.');
        let answered: { result: Awaited<ReturnType<TextHost['client']['embed']>>; host: TextHost };
        try {
            answered = await this.onHosts(request.kind, hosts, (host) => host.client.embed({ model, inputs: request.inputs }));
        } catch (error) {
            if (error instanceof OutOfCreditError && this.deps.textHosts.some((host) => !host.embeds)) {
                throw new NoEmbeddingCreditError(`No host with an embedding model has credit; text goes on on the free model. ${error.message}`);
            }
            throw error;
        }
        const { result, host } = answered;
        // Whole billionths of a dollar: a search is about $0.000005.
        const costUsd = result.costUsd ?? Math.round(result.promptTokens * model.priceUsdPerMillion * 1e3) / 1e9;
        await this.deps.usage.record({
            kind: request.kind,
            pool: 'text',
            model: modelName,
            host: host.recordedHost ?? model.host,
            promptTokens: result.promptTokens,
            completionTokens: 0,
            images: null,
            costUsd,
            storyId: request.servedFor?.storyId ?? null,
            chatId: request.servedFor?.chatId ?? null,
            messageId: request.servedFor?.messageId ?? null,
        });
        return { vectors: result.vectors, model: modelName, usage: { promptTokens: result.promptTokens }, costUsd };
    }

    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        if (request.kind === 'image_cutout') return this.cutOut(request);
        const referenceCount = request.referenceImages?.length ?? 0;
        if (referenceCount > MAX_REFERENCE_IMAGES) {
            throw new RangeError(`At most ${MAX_REFERENCE_IMAGES} reference images, got ${referenceCount}`);
        }
        const settings = await this.deps.settings.current();
        const modelName = imageModelForKind(request.kind, settings.imageModel, referenceCount);
        const model = IMAGE_MODELS[modelName];
        // Reference images ask for 2K, Expressions for 1K (their price in the editor), Snapshots for the Settings size.
        const wanted = request.kind === 'reference_image' ? '2K' : request.kind === 'snapshot_image' ? settings.snapshotSize : '1K';
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
            messageId: request.servedFor?.messageId ?? null,
        });

        return { image, model: modelName, costUsd };
    }

    /** The one reference image with its background taken away (`image_cutout`), on Venice, in the image pool. */
    private async cutOut(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        const source = request.referenceImages?.[0];
        if (!source || request.referenceImages!.length !== 1) throw new RangeError('image_cutout takes exactly one reference image');
        const image = await this.deps.venice.removeBackground(source);
        const costUsd = IMAGE_CUTOUT_PRICE_USD;
        await this.deps.usage.record({
            kind: request.kind,
            pool: 'image',
            model: IMAGE_CUTOUT_MODEL,
            host: VENICE_HOST,
            promptTokens: null,
            completionTokens: null,
            images: 1,
            costUsd,
            storyId: request.servedFor?.storyId ?? null,
            chatId: request.servedFor?.chatId ?? null,
            messageId: request.servedFor?.messageId ?? null,
        });
        return { image, model: IMAGE_CUTOUT_MODEL, costUsd };
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
            messageId: request.servedFor?.messageId ?? null,
        });
        return { text: answer.text.trim(), model: modelName, costUsd };
    }

    /**
     * Kokoro on Venice. One Venice-pool UsageRecord per answered call at list price: Venice
     * reports no cost, so it is the characters sent times `pricing.input` (or the stored price
     * when the models list can't be read), in whole millionths of a dollar.
     */
    async synthesizeSpeech(request: SpeechRequest): Promise<SpeechResult> {
        const modelName = request.model ?? SPEECH_MODEL;
        const model = SPEECH_MODELS[modelName];
        const characters = request.text.length;
        if (characters === 0 || characters > model.requestCharacterLimit) {
            throw new RangeError(`Speech text must be 1 to ${model.requestCharacterLimit} characters, got ${characters}`);
        }
        const listed = await this.deps.venice.speechModel(model.id);
        const priceUsdPerMillion = listed?.priceUsdPerMillion ?? model.fallbackPriceUsdPerMillion;
        const bytes = await this.deps.venice.speak({ modelId: model.id, input: request.text, voice: request.voice, language: request.language, prompt: request.prompt });
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
            messageId: request.servedFor?.messageId ?? null,
        });
        return { audio: { bytes, mimeType: 'audio/mpeg' }, model: modelName, characters, costUsd };
    }

    /** The English voices Venice lists for Kokoro, or the stored ones when the list can't be read. */
    async speechVoices(): Promise<SpeechVoice[]> {
        const model = SPEECH_MODELS[SPEECH_MODEL];
        const ids = (await this.deps.venice.speechModel(model.id))?.voices ?? model.fallbackVoices;
        return ids.flatMap((id) => englishVoice(id) ?? []);
    }

    /** Qwen 3's voices and Kokoro's Japanese ones as Venice lists them, or the stored ones. */
    async dubVoices(): Promise<DubVoices> {
        const qwen = SPEECH_MODELS[DUB_SPEECH_MODEL];
        const kokoro = SPEECH_MODELS[SPEECH_MODEL];
        const speech = [...((await this.deps.venice.speechModel(qwen.id))?.voices ?? qwen.fallbackVoices)];
        const listed = (await this.deps.venice.speechModel(kokoro.id))?.voices ?? [];
        const japanese = listed.filter((id) => /^j[fm]_[a-z]+$/.test(id));
        return { speech, narration: japanese.length > 0 ? japanese : [...JAPANESE_NARRATION_FALLBACK] };
    }

    async remainingCredit(): Promise<RemainingCredit> {
        const now = Date.now();
        if (this.creditCache && now - this.creditCache.readAt < this.creditCacheMs) {
            return structuredClone(this.creditCache.credit);
        }
        const [text, image] = await Promise.all([this.textCredit(), this.readCredit('image', () => this.deps.venice.credit())]);
        const credit = { text, image };
        this.creditCache = { readAt: now, credit };
        return structuredClone(credit);
    }

    /**
     * The text pool: the balance of the first host in the chain that can still serve a call, named
     * by `host`. A host passed over for credit, or whose balance reads used up, gives way to the next;
     * the last host's balance stands whatever it reads, so the pool reads out only when every host is
     * out. The free model's balance is unknown, which never blocks a call.
     */
    private async textCredit(): Promise<CreditBalance> {
        const hosts = this.deps.textHosts;
        for (let at = 0; ; at++) {
            const host = hosts[at];
            const last = at === hosts.length - 1;
            if (!last && this.isOutOfCredit(host)) continue;
            const reading = await this.creditOf(host);
            if (!last && reading.remainingUsd !== null && reading.remainingUsd <= 0) continue;
            return { ...reading, host: host.name };
        }
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
    // Only a play model runs on the user's Sampling; a background kind's fixed values are not theirs to reset.
    if (!(error instanceof SamplerRefusedError) || !isPlayModel(modelName)) return error;
    return new ProviderOutageError(
        `DeepInfra no longer takes one of the Sampling values for ${playModelName(modelName)}. Reset Sampling for it in Settings.`,
    );
}

/** An image's list price: the model's price, plus each input image past the first where the model charges for them. */

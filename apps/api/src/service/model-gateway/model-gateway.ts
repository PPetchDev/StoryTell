/**
 * The one boundary to external model providers (spec: "Model Gateway"). Everything about
 * providers stays behind this interface: which model and host serve a call kind, reasoning
 * settings, stop-string support, the fixed 2:3 image size, usage records and error mapping.
 *
 * Callers never name a model. The gateway picks it from the call kind and Settings, so there
 * is no path for a caller to switch model silently. Failures reject with a
 * `ModelGatewayError` subclass from src/errors/model-gateway.errors.ts.
 */
export abstract class ModelGateway {
    abstract completeText(request: TextCompletionRequest): Promise<TextCompletionResult>;

    /**
     * The same call as `completeText`, with the text handed to `stream.onText` piece by piece
     * as the model writes it (spec: streaming replies). It resolves once the reply is
     * complete. Aborting `stream.signal` ends the call early: it then resolves with
     * `stopped: true` and the text that had arrived. Turns only.
     */
    abstract streamText(request: TextCompletionRequest, stream: TextStream): Promise<TextStreamResult>;

    abstract generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;

    /**
     * Turns texts into vectors (Spec: Documents, "The Model Gateway learns embeddings"): one
     * vector per input, in input order. Text pool; callers never name the model.
     */
    abstract embedTexts(request: EmbeddingRequest): Promise<EmbeddingResult>;

    abstract remainingCredit(): Promise<RemainingCredit>;
}

export type CreditPool = 'text' | 'image';

export type TextCallKind =
    | 'turn'
    | 'judge'
    | 'memory_extraction'
    | 'story_draft'
    | 'field_rewrite'
    | 'story_assistant'
    | 'snapshot_prompt'
    | 'suggested_replies'
    | 'story_summary';

export type ImageCallKind = 'snapshot_image' | 'reference_image';

/** A Document's passages turned into vectors on Add, and one query per turn. Both in the text pool. */
export type EmbeddingCallKind = 'document_embedding' | 'document_search';

export type CallKind = TextCallKind | ImageCallKind | EmbeddingCallKind;

export const MAX_REFERENCE_IMAGES = 3;

/**
 * The app's own model names. Settings store them, AI Messages record them for the Drift
 * notice, and UsageRecords carry them. The provider ids and hosts behind each one live in
 * the real gateway's model table.
 */
export const PLAY_MODELS = ['glm-5.3', 'deepseek-v4-pro'] as const;
export type PlayModel = (typeof PLAY_MODELS)[number];
export const BACKGROUND_MODEL = 'deepseek-v4-flash';
/**
 * Where a background call goes when the background model's host stays busy (a 429 or 503
 * through every retry): a bigger model on the same host, so background work doesn't stall.
 */
export const BACKGROUND_FALLBACK_MODEL: PlayModel = 'deepseek-v4-pro';
export type TextModel = PlayModel | typeof BACKGROUND_MODEL;
/** The one embedding model: BAAI's bge-m3, pinned to DeepInfra (Spec: Documents). */
export const EMBEDDING_MODEL = 'bge-m3';
export type EmbeddingModel = typeof EMBEDDING_MODEL;

export const SNAPSHOT_MODELS = ['seedream-v4-edit', 'seedream-v5-pro-edit', 'qwen-edit-uncensored'] as const;
export type SnapshotModel = (typeof SNAPSHOT_MODELS)[number];
export const REFERENCE_IMAGE_MODEL = 'qwen-image-3';
/**
 * The edit models need a base image. A Snapshot with no Reference image among its Characters
 * in frame is drawn from text alone (spec: story 42) by the same family's text-to-image model,
 * picked from the Settings model, never as a fallback after a failure.
 */
export const TEXT_ONLY_SNAPSHOT_MODELS = {
    'seedream-v4-edit': 'seedream-v4',
    'seedream-v5-pro-edit': 'seedream-v5-pro',
    'qwen-edit-uncensored': REFERENCE_IMAGE_MODEL,
} as const satisfies Record<SnapshotModel, string>;
export type ImageModel = SnapshotModel | typeof REFERENCE_IMAGE_MODEL | (typeof TEXT_ONLY_SNAPSHOT_MODELS)[SnapshotModel];

/**
 * The sampler values a play model may be sent, in the order Settings shows them. The app's
 * names; the real gateway sends them under OpenRouter's (`min_p` and so on).
 */
export const SAMPLER_PARAMS = ['temperature', 'minP', 'topP', 'repetitionPenalty'] as const;
export type SamplerParam = (typeof SAMPLER_PARAMS)[number];
/** A value is set only when its key is present; an absent key is never sent. */
export type SamplerValues = Partial<Record<SamplerParam, number>>;
/** Sampling as Settings stores it: per play model. A key for a model that has left the list is kept but never read. */
export type PlaySamplers = Partial<Record<PlayModel, SamplerValues>>;

/**
 * What each parameter may be set to, inclusive, at most two decimal places, and the step the
 * Settings field moves by. Narrower than OpenRouter's where the extremes only break prose.
 */
export const SAMPLER_RANGES: Record<SamplerParam, { min: number; max: number; step: number }> = {
    temperature: { min: 0, max: 2, step: 0.05 },
    minP: { min: 0, max: 0.5, step: 0.01 },
    topP: { min: 0.05, max: 1, step: 0.01 },
    repetitionPenalty: { min: 1, max: 1.5, step: 0.01 },
};

/** A play model's facts that callers outside the gateway read, with the real or the fake gateway. */
export interface PlayModelFacts {
    /** Its proper name, as Settings and the Drift notice show it. */
    name: string;
    /** List price in USD per million tokens, for display only: UsageRecords keep what OpenRouter reports. */
    priceUsdPerMillion: { input: number; output: number; cachedInput: number };
    /** The sampler parameters its host lists in `supported_parameters`, in SAMPLER_PARAMS order. */
    samplers: SamplerParam[];
    /** The maker's suggested values, where the maker publishes any. A hint only: never sent unless set. */
    suggested: SamplerValues;
}

/**
 * Every play model's display facts, read with SNAPSHOT_MODEL_PRICES's reasoning: Settings and
 * the Chat read them, so they sit here rather than in the real model table. Typed over
 * PlayModel, so a play model without an entry does not compile.
 *
 * Prices and `supported_parameters` from OpenRouter's endpoints API for the DeepInfra endpoint,
 * read on 2026-11-09. Suggestions from docs/research/models-samplers-embeddings.md.
 */
export const PLAY_MODEL_CATALOGUE: Record<PlayModel, PlayModelFacts> = {
    // The model card gives no single recommendation, only benchmark settings.
    'glm-5.3': {
        name: 'GLM-5.3',
        priceUsdPerMillion: { input: 0.5625, output: 2.5, cachedInput: 0.125 },
        samplers: ['temperature', 'minP', 'topP', 'repetitionPenalty'],
        suggested: {},
    },
    // The V4-Pro card: temperature 1.0 and top_p 1.0 for local deployment.
    'deepseek-v4-pro': {
        name: 'DeepSeek V4 Pro',
        priceUsdPerMillion: { input: 1.3, output: 2.6, cachedInput: 0.1 },
        samplers: ['temperature', 'minP', 'topP', 'repetitionPenalty'],
        suggested: { temperature: 1, topP: 1 },
    },
};

/** A model's proper name; a model no longer in the catalogue (an old AI Message's) keeps its stored id. */
export function playModelName(model: string): string {
    return isPlayModel(model) ? PLAY_MODEL_CATALOGUE[model].name : model;
}

export function isPlayModel(model: string): model is PlayModel {
    return (PLAY_MODELS as readonly string[]).includes(model);
}

export const DEFAULT_PLAY_MODEL: PlayModel = 'glm-5.3';
export const DEFAULT_SNAPSHOT_MODEL: SnapshotModel = 'seedream-v4-edit';

/** How large a Snapshot is drawn: Venice's resolution tiers, the long side about 1024 or 2048 px. */
export const SNAPSHOT_SIZES = ['1K', '2K'] as const;
export type SnapshotSize = (typeof SNAPSHOT_SIZES)[number];
export const DEFAULT_SNAPSHOT_SIZE: SnapshotSize = '1K';

/**
 * What one Snapshot costs at each size its model draws at, with one input image (Venice's
 * `GET /models` on 2026-11-05). A size left out is not offered for that model. The real
 * gateway's model table takes these prices, and Settings shows them.
 */
export const SNAPSHOT_MODEL_PRICES: Record<SnapshotModel, { '1K': number; '2K'?: number }> = {
    'seedream-v4-edit': { '1K': 0.05 },
    'seedream-v5-pro-edit': { '1K': 0.06, '2K': 0.11 },
    'qwen-edit-uncensored': { '1K': 0.04 },
};

/** The sizes a Snapshot model is offered at, smallest first. */
export function snapshotSizesOf(model: SnapshotModel): SnapshotSize[] {
    return SNAPSHOT_SIZES.filter((size) => SNAPSHOT_MODEL_PRICES[model][size] !== undefined);
}

export interface PromptMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/** What a call served, so its usage record can point back at it. */
export interface ServedFor {
    storyId?: number;
    chatId?: number;
}

export interface TextCompletionRequest {
    kind: TextCallKind;
    messages: PromptMessage[];
    maxTokens?: number;
    /** Ask for a JSON object. The text still comes back as a string for the caller to parse. */
    json?: boolean;
    /** Sent only to hosts that support them; the caller must still guard the output itself. */
    stop?: string[];
    servedFor?: ServedFor;
}

export interface TextCompletionResult {
    text: string;
    /** The model that wrote the text. AI Messages record it for the Drift notice. */
    model: string;
    usage: { promptTokens: number; completionTokens: number };
    costUsd: number;
}

export interface TextStream {
    /** Each new piece of text, in order. Never called after the call settles. */
    onText(piece: string): void;
    /** Aborting it stops the model call, as the user's Stop or the guard does. */
    signal: AbortSignal;
}

export interface TextStreamResult extends TextCompletionResult {
    /**
     * True when the signal ended the call before the model finished; `text` is what had
     * arrived. A stopped stream reports no usage of its own, so `usage` and `costUsd` are 0:
     * the real gateway records what the provider bills for it once the provider reports it.
     */
    stopped: boolean;
}

export interface ImageData {
    bytes: Buffer;
    mimeType: string;
}

export interface ImageGenerationRequest {
    kind: ImageCallKind;
    prompt: string;
    /** At most MAX_REFERENCE_IMAGES. */
    referenceImages?: ImageData[];
    servedFor?: ServedFor;
}

export interface ImageGenerationResult {
    image: ImageData;
    model: string;
    costUsd: number;
}

export interface EmbeddingRequest {
    kind: EmbeddingCallKind;
    /** At least one. Each becomes one vector. */
    inputs: string[];
    servedFor?: ServedFor;
}

export interface EmbeddingResult {
    /** One per input, in input order. */
    vectors: number[][];
    /** The model that made them. Stored with a Document's passages, so another model's are never compared. */
    model: string;
    usage: { promptTokens: number };
    costUsd: number;
}

export interface CreditBalance {
    /** Null when the provider can't report it (Venice without an Admin key). */
    remainingUsd: number | null;
    /** The pool's cap, when the provider reports one. */
    limitUsd: number | null;
}

export type RemainingCredit = Record<CreditPool, CreditBalance>;

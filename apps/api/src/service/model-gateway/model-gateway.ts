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

    abstract generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;

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
    | 'suggested_replies';

export type ImageCallKind = 'snapshot_image' | 'reference_image';

export type CallKind = TextCallKind | ImageCallKind;

export const MAX_REFERENCE_IMAGES = 3;

/**
 * The app's own model names. Settings store them, AI Messages record them for the Drift
 * notice, and UsageRecords carry them. The provider ids and hosts behind each one live in
 * the real gateway's model table.
 */
export const PLAY_MODELS = ['glm-5.3', 'deepseek-v4-pro'] as const;
export type PlayModel = (typeof PLAY_MODELS)[number];
export const BACKGROUND_MODEL = 'deepseek-v4-flash';
export type TextModel = PlayModel | typeof BACKGROUND_MODEL;

export const SNAPSHOT_MODELS = ['seedream-v4-edit', 'qwen-edit-uncensored'] as const;
export type SnapshotModel = (typeof SNAPSHOT_MODELS)[number];
export const REFERENCE_IMAGE_MODEL = 'qwen-image-3';
/**
 * The edit models need a base image. A Snapshot with no Reference image among its Characters
 * in frame is drawn from text alone (spec: story 42) by the same family's text-to-image model,
 * picked from the Settings model, never as a fallback after a failure.
 */
export const TEXT_ONLY_SNAPSHOT_MODELS = {
    'seedream-v4-edit': 'seedream-v4',
    'qwen-edit-uncensored': REFERENCE_IMAGE_MODEL,
} as const satisfies Record<SnapshotModel, string>;
export type ImageModel = SnapshotModel | typeof REFERENCE_IMAGE_MODEL | (typeof TEXT_ONLY_SNAPSHOT_MODELS)[SnapshotModel];

export const DEFAULT_PLAY_MODEL: PlayModel = 'glm-5.3';
export const DEFAULT_SNAPSHOT_MODEL: SnapshotModel = 'seedream-v4-edit';

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

export interface CreditBalance {
    /** Null when the provider can't report it (Venice without an Admin key). */
    remainingUsd: number | null;
    /** The pool's cap, when the provider reports one. */
    limitUsd: number | null;
}

export type RemainingCredit = Record<CreditPool, CreditBalance>;

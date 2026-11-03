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
    | 'snapshot_prompt';

export type ImageCallKind = 'snapshot_image' | 'reference_image';

export const MAX_REFERENCE_IMAGES = 3;

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
    remainingUsd: number;
    /** The pool's cap, when the provider reports one. */
    limitUsd: number | null;
}

export type RemainingCredit = Record<CreditPool, CreditBalance>;

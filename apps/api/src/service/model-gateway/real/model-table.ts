import {
    ImageCallKind,
    ImageModel,
    REFERENCE_IMAGE_MODEL,
    SnapshotModel,
    TEXT_ONLY_SNAPSHOT_MODELS,
    TextCallKind,
    TextModel,
} from '../model-gateway.js';

/**
 * Spec: "Model Gateway", model table. Each text model is pinned to one OpenRouter host with
 * `allow_fallbacks: false`, and carries the reasoning setting that host needs.
 */
export interface TextModelSpec {
    /** The OpenRouter model id. */
    id: string;
    /** The OpenRouter provider slug sent in `provider.only`. */
    host: string;
    /**
     * GLM-5.3 can't turn reasoning off on DeepInfra ("mandatory"), so it gets the minimal
     * effort; the DeepSeek models take `enabled: false`.
     */
    reasoning: { effort: 'minimal' } | { enabled: false };
    /** GMICloud ignores `stop`, so stop strings are never sent there. */
    stopStrings: boolean;
}

export const TEXT_MODELS: Record<TextModel, TextModelSpec> = {
    'glm-5.3': {
        id: 'z-ai/glm-5.3',
        host: 'deepinfra',
        reasoning: { effort: 'minimal' },
        stopStrings: true,
    },
    'deepseek-v4-pro': {
        id: 'deepseek/deepseek-v4-pro',
        host: 'gmicloud',
        reasoning: { enabled: false },
        stopStrings: false,
    },
    'deepseek-v4-flash': {
        id: 'deepseek/deepseek-v4-flash',
        host: 'deepinfra',
        reasoning: { enabled: false },
        stopStrings: true,
    },
};

/** The play model serves these kinds; every other text kind is a background call. */
const PLAY_MODEL_KINDS: ReadonlySet<TextCallKind> = new Set<TextCallKind>([
    'turn',
    'story_draft',
    'field_rewrite',
    'story_assistant',
]);

export function isPlayModelKind(kind: TextCallKind): boolean {
    return PLAY_MODEL_KINDS.has(kind);
}

export interface ImageModelSpec {
    /** Venice's model id, sent as `model` (generate) or `modelId` (multi-edit). */
    id: string;
    endpoint: 'generate' | 'multi-edit';
    /** Venice reports no per-image cost, so UsageRecords carry the list price. */
    listPriceUsd: number;
    /**
     * `GET /models` reports `constraints.promptCharacterLimit`; this is the value read on
     * 2026-11-04, used when that call fails.
     */
    fallbackPromptCharacterLimit: number;
}

export const IMAGE_MODELS: Record<ImageModel, ImageModelSpec> = {
    'seedream-v4-edit': {
        id: 'seedream-v4-edit',
        endpoint: 'multi-edit',
        listPriceUsd: 0.05,
        fallbackPromptCharacterLimit: 10_000,
    },
    'qwen-edit-uncensored': {
        id: 'qwen-edit-uncensored',
        endpoint: 'multi-edit',
        listPriceUsd: 0.04,
        fallbackPromptCharacterLimit: 1500,
    },
    'seedream-v4': {
        id: 'seedream-v4',
        endpoint: 'generate',
        listPriceUsd: 0.05,
        fallbackPromptCharacterLimit: 10_000,
    },
    'qwen-image-3': {
        id: 'qwen-image-3',
        endpoint: 'generate',
        listPriceUsd: 0.04,
        fallbackPromptCharacterLimit: 10_000,
    },
};

export const VENICE_HOST = 'venice';

/** A Snapshot with no reference image goes to its model's text-to-image sibling, which needs no base image. */
export function imageModelForKind(kind: ImageCallKind, snapshotModel: SnapshotModel, referenceCount: number): ImageModel {
    if (kind === 'reference_image') return REFERENCE_IMAGE_MODEL;
    return referenceCount === 0 ? TEXT_ONLY_SNAPSHOT_MODELS[snapshotModel] : snapshotModel;
}

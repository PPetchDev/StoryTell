import {
    ImageCallKind,
    ImageModel,
    REFERENCE_IMAGE_MODEL,
    SNAPSHOT_MODEL_PRICES,
    SnapshotModel,
    SnapshotSize,
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
    /** False for a host that ignores `stop` (GMICloud did), so stop strings are never sent there. */
    stopStrings: boolean;
}

export const TEXT_MODELS: Record<TextModel, TextModelSpec> = {
    'glm-5.3': {
        id: 'z-ai/glm-5.3',
        host: 'deepinfra',
        reasoning: { effort: 'minimal' },
        stopStrings: true,
    },
    // On DeepInfra since 2026-11-05: GMICloud's terms ban "obscene" material, and it ignored `stop`.
    'deepseek-v4-pro': {
        id: 'deepseek/deepseek-v4-pro',
        host: 'deepinfra',
        reasoning: { enabled: false },
        stopStrings: true,
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
    'suggested_replies',
]);

export function isPlayModelKind(kind: TextCallKind): boolean {
    return PLAY_MODEL_KINDS.has(kind);
}

export interface ImageModelSpec {
    /** Venice's model id, sent as `model` (generate) or `modelId` (multi-edit). */
    id: string;
    endpoint: 'generate' | 'multi-edit';
    /**
     * Venice reports no per-image cost, so UsageRecords carry the list price of the size drawn.
     * A model with no 2K price is drawn at 1K only.
     */
    prices: { '1K': number; '2K'?: number };
    /** The list price of each input image past the first, where Venice charges for them (`pricing.inputImages`). */
    extraInputImageUsd?: number;
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
        prices: SNAPSHOT_MODEL_PRICES['seedream-v4-edit'],
        fallbackPromptCharacterLimit: 10_000,
    },
    // Venice's `GET /models` on 2026-11-05: one input image included, $0.00345 per further one.
    'seedream-v5-pro-edit': {
        id: 'seedream-v5-pro-edit',
        endpoint: 'multi-edit',
        prices: SNAPSHOT_MODEL_PRICES['seedream-v5-pro-edit'],
        extraInputImageUsd: 0.00345,
        fallbackPromptCharacterLimit: 10_000,
    },
    'qwen-edit-uncensored': {
        id: 'qwen-edit-uncensored',
        endpoint: 'multi-edit',
        prices: SNAPSHOT_MODEL_PRICES['qwen-edit-uncensored'],
        fallbackPromptCharacterLimit: 1500,
    },
    'seedream-v4': {
        id: 'seedream-v4',
        endpoint: 'generate',
        prices: { '1K': 0.05 },
        fallbackPromptCharacterLimit: 10_000,
    },
    'seedream-v5-pro': {
        id: 'seedream-v5-pro',
        endpoint: 'generate',
        prices: { '1K': 0.06, '2K': 0.11 },
        fallbackPromptCharacterLimit: 10_000,
    },
    // Venice's `GET /models` on 2026-11-05: $0.04 at both 1K and 2K, so it always draws at 2K.
    'qwen-image-3': {
        id: 'qwen-image-3',
        endpoint: 'generate',
        prices: { '1K': 0.04, '2K': 0.04 },
        fallbackPromptCharacterLimit: 10_000,
    },
};

export const VENICE_HOST = 'venice';

/**
 * The size an image is drawn at: the one asked for when the model has it, and 2K whenever it
 * costs no more than 1K. Reference images ask for 2K; Snapshots ask for the Settings size.
 */
export function drawnSize(model: ImageModelSpec, wanted: SnapshotSize): SnapshotSize {
    const twoK = model.prices['2K'];
    if (twoK === undefined) return '1K';
    return wanted === '2K' || twoK <= model.prices['1K'] ? '2K' : '1K';
}

/** A Snapshot with no reference image goes to its model's text-to-image sibling, which needs no base image. */
export function imageModelForKind(kind: ImageCallKind, snapshotModel: SnapshotModel, referenceCount: number): ImageModel {
    if (kind === 'reference_image') return REFERENCE_IMAGE_MODEL;
    return referenceCount === 0 ? TEXT_ONLY_SNAPSHOT_MODELS[snapshotModel] : snapshotModel;
}

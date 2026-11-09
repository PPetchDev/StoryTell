import {
    EmbeddingModel,
    ImageCallKind,
    ImageModel,
    PlayModelFacts,
    REFERENCE_IMAGE_MODEL,
    SNAPSHOT_MODEL_PRICES,
    SnapshotModel,
    SnapshotSize,
    TEXT_ONLY_SNAPSHOT_MODELS,
    TextCallKind,
    TextModel,
} from '../model-gateway.js';

/**
 * How reasoning is turned off, or as low as it goes, on a host: `effort` where OpenRouter maps
 * it (`none` or `minimal`), else `enabled: false`.
 */
export type ReasoningSetting = { effort: 'minimal' } | { effort: 'none' } | { enabled: false };

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
    reasoning: ReasoningSetting;
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

/** An embedding model, pinned to one OpenRouter host like the text models. */
export interface EmbeddingModelSpec {
    /** The OpenRouter model id. */
    id: string;
    /** The OpenRouter provider slug sent in `provider.only`. */
    host: string;
    /** How many numbers each vector has. */
    dimensions: number;
    /** The host's list price, recorded when OpenRouter reports no cost (as image calls record list prices). */
    priceUsdPerMillion: number;
}

/**
 * Spec: Documents. OpenRouter's endpoints API for `baai/bge-m3`, read on 2026-11-09: DeepInfra
 * serves it (fp32) at $0.01 per million prompt tokens, with an 8,192-token context. DeepInfra
 * for the same reason as chat: no adult clause in its terms, and no storing or training on
 * inference data.
 */
export const EMBEDDING_MODELS: Record<EmbeddingModel, EmbeddingModelSpec> = {
    'bge-m3': {
        id: 'baai/bge-m3',
        host: 'deepinfra',
        dimensions: 1024,
        priceUsdPerMillion: 0.01,
    },
};

/**
 * A candidate play model (.scratch/models-and-samplers/spec.md: "More play models"): a
 * provisional, pinned entry that only the live smoke run reads. It is outside PLAY_MODELS and
 * the catalogue, so neither Settings nor the DTO can choose it. A candidate that passes moves to
 * PLAY_MODELS, TEXT_MODELS (with the reasoning setting and stop-string support the run
 * confirmed) and PLAY_MODEL_CATALOGUE, and its entry here goes.
 */
export interface CandidateModelSpec {
    /** The OpenRouter model id. */
    id: string;
    /** Always DeepInfra, whose terms are already checked, with no fallback. */
    host: 'deepinfra';
    /** The reasoning settings to try, in order; the smoke run plays on the one with fewest reasoning tokens. */
    reasoningToTry: ReasoningSetting[];
    /** Assumed on until the smoke run's stop probe says otherwise. */
    stopStrings: boolean;
    /** What the catalogue entry would hold: name, prices, offered samplers, the maker's suggestions. */
    facts: PlayModelFacts;
}

/**
 * Prices and `supported_parameters` from OpenRouter's endpoints API for the DeepInfra endpoint,
 * read on 2026-11-09 (all three list the four sampler parameters). Reasoning settings and maker
 * suggestions from docs/research/models-samplers-embeddings.md.
 */
export const CANDIDATE_MODELS = {
    // No maker suggestion published.
    'kimi-k3.1-pro': {
        id: 'moonshotai/kimi-k3.1-pro',
        host: 'deepinfra',
        reasoningToTry: [{ effort: 'none' }, { effort: 'minimal' }, { enabled: false }],
        stopStrings: true,
        facts: {
            name: 'Kimi K3.1-Pro',
            priceUsdPerMillion: { input: 1.9, output: 9.5, cachedInput: 0.19 },
            samplers: ['temperature', 'minP', 'topP', 'repetitionPenalty'],
            suggested: {},
        },
    },
    // The card's instant mode: temperature 0.6, top_p 0.95. Output is capped at 16,384 tokens.
    'kimi-k2.6': {
        id: 'moonshotai/kimi-k2.6',
        host: 'deepinfra',
        reasoningToTry: [{ enabled: false }, { effort: 'none' }],
        stopStrings: true,
        facts: {
            name: 'Kimi K2.6',
            priceUsdPerMillion: { input: 0.75, output: 3.5, cachedInput: 0.15 },
            samplers: ['temperature', 'minP', 'topP', 'repetitionPenalty'],
            suggested: { temperature: 0.6, topP: 0.95 },
        },
    },
    // The card's non-thinking mode: temperature 0.7, top_p 0.8.
    'qwen3.5-397b': {
        id: 'qwen/qwen3.5-397b-a17b',
        host: 'deepinfra',
        reasoningToTry: [{ enabled: false }, { effort: 'none' }],
        stopStrings: true,
        facts: {
            name: 'Qwen3.5-397B',
            priceUsdPerMillion: { input: 0.45, output: 3, cachedInput: 0.22 },
            samplers: ['temperature', 'minP', 'topP', 'repetitionPenalty'],
            suggested: { temperature: 0.7, topP: 0.8 },
        },
    },
} as const satisfies Record<string, CandidateModelSpec>;

export type CandidateModel = keyof typeof CANDIDATE_MODELS;

/** A candidate as the OpenRouter client takes a model, with one of its reasoning settings. */
export function candidateTextModel(candidate: CandidateModel, reasoning: ReasoningSetting): TextModelSpec {
    const spec: CandidateModelSpec = CANDIDATE_MODELS[candidate];
    return { id: spec.id, host: spec.host, reasoning, stopStrings: spec.stopStrings };
}

/** The play model serves these kinds; every other text kind is a background call. */
const PLAY_MODEL_KINDS: ReadonlySet<TextCallKind> = new Set<TextCallKind>([
    'turn',
    'story_draft',
    'field_rewrite',
    'story_assistant',
    'suggested_replies',
    'write_for_me',
]);

export function isPlayModelKind(kind: TextCallKind): boolean {
    return PLAY_MODEL_KINDS.has(kind);
}

/**
 * The play-model kinds that send the user's Sampling (spec: "Which calls use them"). Story
 * drafting, the Story assistant and field rewrites stay on host defaults: their JSON and
 * structured answers were tuned there.
 */
const SAMPLED_KINDS: ReadonlySet<TextCallKind> = new Set<TextCallKind>(['turn', 'suggested_replies', 'write_for_me']);

export function isSampledKind(kind: TextCallKind): boolean {
    return SAMPLED_KINDS.has(kind);
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

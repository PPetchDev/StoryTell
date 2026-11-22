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

    /**
     * The model `embedTexts` answers with now, the same name its results carry. Makes no call:
     * the Memory backfill reads it to find vectors another model made.
     */
    abstract embeddingModel(): string;

    /**
     * Transcription for Dictation (.scratch/dictation/spec.md, "Model Gateway"): one recording, transcribed
     * in the language asked for. Venice pool; callers never name the model.
     */
    abstract transcribe(request: TranscriptionRequest): Promise<TranscriptionResult>;

    /**
     * Speech for Read aloud and voice samples (.scratch/read-aloud/spec.md, "Provider and the
     * Model Gateway"). Venice pool; callers never name the model. Text longer than
     * SPEECH_CHARACTER_LIMIT is a programming error (`RangeError`), never sent: the play queue
     * splits text first.
     */
    abstract synthesizeSpeech(request: SpeechRequest): Promise<SpeechResult>;

    /** The English voices speech can be made in. Makes no paid call. */
    abstract speechVoices(): Promise<SpeechVoice[]>;

    /**
     * A Japanese dub's voices (.scratch/japanese-dub/spec.md): Qwen 3's, for spoken lines, and
     * Kokoro's Japanese ones, for narration. Makes no paid call.
     */
    abstract dubVoices(): Promise<DubVoices>;

    abstract remainingCredit(): Promise<RemainingCredit>;

    /**
     * What one cut-out costs now, for the editor's button: nothing with the app's own background
     * remover (.scratch/own-cutout/spec.md), else Venice's price. Makes no call.
     */
    abstract cutoutPriceUsd(): number;

    /** Whether the app's own background remover is set up here, so a cut-out can be had for nothing. Makes no call. */
    abstract ownCutoutAvailable(): boolean;
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
    | 'story_summary'
    | 'chapter_summary'
    | 'previously_on'
    /** Lore entries suggested from what a Chat has established about the world (.scratch/lore-from-chat/spec.md). */
    | 'lore_suggestions'
    /** A Book chapter: one Chapter retold as novel prose (.scratch/chat-novel/spec.md). */
    | 'book_chapter'
    | 'write_for_me'
    | 'thai_reading'
    /** A Message's Read aloud queue in Japanese, for a dub (.scratch/japanese-dub/spec.md): a background-model call. */
    | 'dub_translation'
    | 'diary_entry'
    | 'character_thought'
    | 'speech_repair'
    | 'speech_repair_fallback'
    // A Character messaging the user first (.scratch/reach-outs/spec.md): a background-model call.
    | 'reach_out';

/**
 * `expression_image`: a Character's Expression, drawn from their Reference image (.scratch/expressions/spec.md).
 * `image_cutout`: one picture (the one reference image) given back with its background taken away, as a PNG
 * with transparency, for the Visual novel stage (.scratch/stage-pictures/spec.md); its prompt is not used.
 * `place_picture`: a place with no one in it, behind the stage; `outfit_sprite`: a Character in the outfit
 * the Chat has them in (.scratch/dressed-stage/spec.md).
 */
export type ImageCallKind = 'snapshot_image' | 'reference_image' | 'expression_image' | 'image_cutout' | 'place_picture' | 'outfit_sprite';

/**
 * A Document's passages turned into vectors on Add; a Chat's Memories turned into vectors as they
 * are made, edited or backfilled (`memory_embedding`); and one query per turn, searched for both
 * Memories and Documents (`context_search`, .scratch/memory-by-meaning/spec.md). `document_search`
 * is the per-turn search's kind from before Memories joined it: no call makes it now, but its
 * usage records keep their label. All in the text pool.
 */
export type EmbeddingCallKind = 'document_embedding' | 'document_search' | 'memory_embedding' | 'context_search';

/**
 * Venice audio, in the Venice (`image`) pool: one type shared by Dictation and Read aloud
 * (.scratch/sillytavern-gaps/integration.md, "Venice audio in the Model Gateway").
 */
export type AudioCallKind = 'dictation' | 'read_aloud' | 'voice_preview';

/** The audio kinds that make speech: reading a Message aloud, and a voice's sample in the Story editor. */
export type SpeechCallKind = Extract<AudioCallKind, 'read_aloud' | 'voice_preview'>;

export type CallKind = TextCallKind | ImageCallKind | EmbeddingCallKind | AudioCallKind;

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
/** The one embedding model: BAAI's bge-m3, pinned to DeepInfra (Spec: Documents). */
export const EMBEDDING_MODEL = 'bge-m3';
export type EmbeddingModel = typeof EMBEDDING_MODEL;
/** The one speech-to-text model: Whisper Large V3 on Venice, the only one there that takes a language. */
export const TRANSCRIPTION_MODEL = 'whisper-large-v3';
export type TranscriptionModel = typeof TRANSCRIPTION_MODEL;
/** The text-to-speech model Read aloud uses: Kokoro on Venice, English voices only. */
export const SPEECH_MODEL = 'kokoro';
/**
 * The expressive model of a Japanese dub (.scratch/japanese-dub/spec.md): Qwen 3 TTS 1.7B on
 * Venice, the one there that takes a style prompt, with a native Japanese voice (Ono_Anna).
 */
export const DUB_SPEECH_MODEL = 'qwen3';
export type SpeechModel = typeof SPEECH_MODEL | typeof DUB_SPEECH_MODEL;
/** A Japanese dub's spoken lines read in this voice when the Character has none of their own. */
export const DEFAULT_DUB_VOICE = 'Ono_Anna';
/** A Japanese dub's narration and actions read in this Kokoro voice when the Story has none. */
export const DEFAULT_DUB_NARRATION_VOICE = 'jf_alpha';
/** The most characters one speech request may carry (Venice's limit for `input`). */
export const SPEECH_CHARACTER_LIMIT = 4096;
/** The voice a Story with no Narration voice is read in. */
export const DEFAULT_NARRATION_VOICE = 'af_sky';

export const SNAPSHOT_MODELS = ['seedream-v4-edit', 'seedream-v5-pro-edit', 'qwen-edit-uncensored'] as const;
export type SnapshotModel = (typeof SNAPSHOT_MODELS)[number];
/** The text-to-image model of the qwen family: the one a qwen-edit-uncensored Snapshot is drawn with when nothing in frame has a Reference image. */
export const QWEN_TEXT_IMAGE_MODEL = 'qwen-image-3';
/**
 * Reference images are drawn with seedream-v5-pro (2K, $0.11), so a Character looks like the
 * pictures an author makes in the same soft anime style; qwen-image-3 drew them in a flatter,
 * different style (.scratch/reference-model/spec.md).
 */
export const REFERENCE_IMAGE_MODEL = 'seedream-v5-pro';
/**
 * The edit models need a base image. A Snapshot with no Reference image among its Characters
 * in frame is drawn from text alone (spec: story 42) by the same family's text-to-image model,
 * picked from the Settings model, never as a fallback after a failure.
 */
export const TEXT_ONLY_SNAPSHOT_MODELS = {
    'seedream-v4-edit': 'seedream-v4',
    'seedream-v5-pro-edit': 'seedream-v5-pro',
    'qwen-edit-uncensored': QWEN_TEXT_IMAGE_MODEL,
} as const satisfies Record<SnapshotModel, string>;
export type ImageModel = SnapshotModel | typeof REFERENCE_IMAGE_MODEL | typeof QWEN_TEXT_IMAGE_MODEL | (typeof TEXT_ONLY_SNAPSHOT_MODELS)[SnapshotModel];

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
    /** The AI Message whose reply caused the call (.scratch/cost-view/spec.md: "What a reply's cost holds"). */
    messageId?: number;
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

/**
 * Venice background-remove (.scratch/stage-pictures/spec.md). Its price is not on Venice's pricing page
 * (read 2026-11-18). Measured on the Venice balance on 2026-11-22: 16 cut-outs took $0.48, so $0.03 each.
 */
export const IMAGE_CUTOUT_MODEL = 'background-remove';
export const IMAGE_CUTOUT_PRICE_USD = 0.03;

export interface ImageData {
    bytes: Buffer;
    mimeType: string;
}

/**
 * Who makes a cut-out (.scratch/own-cutout/spec.md, "A choice of two"): the app's own background
 * remover, free, or Venice's, paid. Each is better on some pictures: the app's own leaves no fringe
 * and no ground shadow; Venice's keeps a white part drawn on white with no outline around it.
 */
export const CUTOUT_MAKERS = ['own', 'venice'] as const;
export type CutoutMaker = (typeof CUTOUT_MAKERS)[number];

export interface ImageGenerationRequest {
    kind: ImageCallKind;
    prompt: string;
    /** At most MAX_REFERENCE_IMAGES. */
    referenceImages?: ImageData[];
    /** For `image_cutout` only: who makes it. Left out: the app's own remover where it is set up, else Venice. */
    cutoutBy?: CutoutMaker;
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

export type DictationLanguage = 'th' | 'en';

export interface AudioData {
    bytes: Buffer;
    mimeType: string;
}

export interface TranscriptionRequest {
    kind: 'dictation';
    audio: AudioData;
    language: DictationLanguage;
    /** As the browser measured it. The price is worked from it when Venice reports no duration. */
    durationSeconds: number;
    servedFor?: ServedFor;
}

export interface TranscriptionResult {
    /** Trimmed; empty when nothing was heard. */
    text: string;
    model: string;
    costUsd: number;
}

export interface SpeechRequest {
    kind: SpeechCallKind;
    /** At most SPEECH_CHARACTER_LIMIT characters. */
    text: string;
    /** A voice id of the model: from `speechVoices()` for Kokoro, `dubVoices()` for a dub. */
    voice: string;
    /** Kokoro unless given. */
    model?: SpeechModel;
    /** A language hint, as the model names it ("Japanese" for Qwen 3). */
    language?: string;
    /** How to say it, for a model that takes a style prompt (Qwen 3): "Playful and teasing." */
    prompt?: string;
    servedFor?: ServedFor;
}

/** A Japanese dub's voice ids (.scratch/japanese-dub/spec.md). */
export interface DubVoices {
    /** Qwen 3 voices, for a Character's spoken lines. */
    speech: string[];
    /** Kokoro's Japanese voices, for narration and actions. */
    narration: string[];
}

export interface SpeechResult {
    audio: { bytes: Buffer; mimeType: 'audio/mpeg' };
    model: string;
    /** The characters sent, which the price is worked from. */
    characters: number;
    costUsd: number;
}

export type VoiceAccent = 'american' | 'british';
export type VoiceGender = 'female' | 'male';

/** A Kokoro voice, as the Story editor lists it. */
export interface SpeechVoice {
    /** Kokoro's id, e.g. `af_sky`: accent letter, gender letter, name. */
    id: string;
    /** Built from the id, e.g. "Sky — American, female". */
    label: string;
    accent: VoiceAccent;
    gender: VoiceGender;
}

const VOICE_ACCENTS: Record<string, VoiceAccent> = { a: 'american', b: 'british' };
const VOICE_GENDERS: Record<string, VoiceGender> = { f: 'female', m: 'male' };

/**
 * The voice an English Kokoro id names, or undefined for any other id: the first letter is the
 * accent (`a` American, `b` British), the second the gender, and the rest the name.
 */
export function englishVoice(id: string): SpeechVoice | undefined {
    const match = /^([ab])([fm])_([a-z]+)$/.exec(id);
    if (!match) return undefined;
    const [, accentLetter, genderLetter, name] = match;
    const accent = VOICE_ACCENTS[accentLetter];
    const gender = VOICE_GENDERS[genderLetter];
    const label = `${capitalise(name)} — ${capitalise(accent)}, ${gender}`;
    return { id, label, accent, gender };
}

function capitalise(word: string): string {
    return `${word[0].toUpperCase()}${word.slice(1)}`;
}

export interface CreditBalance {
    /** Null when the provider can't report it (a provider error, the free model, or Venice with no key). */
    remainingUsd: number | null;
    /** The pool's cap, when the provider reports one. */
    limitUsd: number | null;
    /**
     * The text pool only: the host of the text chain this balance is (`openrouter`, `venice` or
     * `free`), the first that can still serve a call (.scratch/text-fallback/spec.md).
     */
    host?: string;
}

export type RemainingCredit = Record<CreditPool, CreditBalance>;

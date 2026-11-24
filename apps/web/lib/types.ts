// Response shapes of the API routes the pages read. Keep in step with apps/api's DTOs.

export type CreditPool = 'text' | 'image';

export interface Settings {
    playModel: string;
    imageModel: string;
    snapshotSize: SnapshotSize;
    textLowCreditPercent: number;
    imageLowCreditPercent: number;
    textCreditCapUsd: number;
    imageCreditCapUsd: number;
    /** Sampling per play model: only the values that are set; a model with none has no key. */
    samplers: Record<string, SamplerValues>;
    updatedAt: string;
}

/** The sampler parameters, in the order Settings shows them (apps/api's SAMPLER_PARAMS). */
export type SamplerParam = 'temperature' | 'minP' | 'topP' | 'repetitionPenalty';
/** Only the values that are set: an absent key is not sent and the host's default applies. */
export type SamplerValues = Partial<Record<SamplerParam, number>>;

export interface SamplerOption {
    param: SamplerParam;
    min: number;
    max: number;
    step: number;
    /** The maker's suggested value, or null. A hint only. */
    suggested: number | null;
}

export interface ModelOption {
    id: string;
    label: string;
}

/** How large Snapshots are drawn. */
export type SnapshotSize = '1K' | '2K';

export interface ImageModelOption extends ModelOption {
    /** The sizes the model draws at, smallest first, each with the list price of one Snapshot. */
    sizes: Array<{ size: SnapshotSize; priceUsd: number }>;
}

export interface PlayModelOption extends ModelOption {
    /** List price in USD per million tokens. */
    priceUsdPerMillion: { input: number; output: number; cachedInput: number };
    /** Roughly what a long turn costs, in USD, to the cent. */
    longTurnUsd: number;
    /** The parameters this model is offered, in order. */
    samplers: SamplerOption[];
}

export interface SettingsResponse {
    settings: Settings;
    playModels: PlayModelOption[];
    imageModels: ImageModelOption[];
    /** What cutting one picture out costs now: 0 with the app's own background remover (.scratch/own-cutout/spec.md). */
    cutoutPriceUsd?: number;
    /** Whether a free cut-out, by the app's own remover, can be asked for. */
    freeCutout?: boolean;
    /** What a cut-out by Venice costs. */
    veniceCutoutPriceUsd?: number;
    /** Whether a small picture is enlarged two times before its soft cut-out, which then comes minutes later (.scratch/soft-cutout/spec.md). */
    softCutoutEnlarges?: boolean;
}

/** The call kinds a UsageRecord is written under (apps/api's `CallKind`). */
export type CallKind =
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
    | 'lore_suggestions'
    | 'book_chapter'
    | 'write_for_me'
    | 'thai_reading'
    | 'dub_translation'
    | 'diary_entry'
    | 'character_thought'
    | 'speech_repair'
    | 'speech_repair_fallback'
    | 'reach_out'
    | 'snapshot_image'
    | 'reference_image'
    | 'expression_image'
    | 'image_cutout'
    | 'place_picture'
    | 'outfit_sprite'
    | 'document_embedding'
    | 'document_search'
    | 'memory_embedding'
    | 'context_search'
    | 'dictation'
    | 'read_aloud'
    | 'voice_preview';

/** What each call kind is for, in the words the Usage page shows. */
export const CALL_KIND_LABEL: Record<CallKind, string> = {
    turn: 'Turns',
    judge: 'Bond, Arc and Scene checks',
    memory_extraction: 'Memory keeping',
    story_draft: 'Story drafts',
    field_rewrite: 'Field rewrites',
    story_assistant: 'Story assistant',
    snapshot_prompt: 'Snapshot descriptions',
    suggested_replies: 'Suggested replies',
    story_summary: 'Story so far',
    chapter_summary: 'Chapter summaries',
    previously_on: 'Previously on recaps',
    lore_suggestions: 'Lore suggestions',
    book_chapter: 'Book chapters',
    write_for_me: 'Write for me',
    thai_reading: 'Thai readings',
    dub_translation: 'Japanese dub translations',
    diary_entry: 'Diary entries',
    character_thought: 'Character thoughts',
    speech_repair: 'Speech repairs',
    speech_repair_fallback: 'Speech repairs (fallback)',
    reach_out: 'Characters messaging first',
    snapshot_image: 'Snapshots',
    reference_image: 'Reference images',
    expression_image: 'Expression pictures',
    image_cutout: 'Picture cut-outs',
    place_picture: 'Place pictures',
    outfit_sprite: 'Outfit pictures',
    document_embedding: 'Document adding',
    document_search: 'Document search',
    memory_embedding: 'Memory embedding',
    context_search: 'Memory and Document search',
    dictation: 'Dictation',
    read_aloud: 'Read aloud',
    voice_preview: 'Voice samples',
};

/** One call kind's share of a pool's spend this month. */
export interface KindSpend {
    kind: CallKind;
    spentUsd: number;
    calls: number;
}

export interface PoolUsage {
    spentUsd: number;
    calls: number;
    /** Most spent first; kinds with no calls this month are left out. */
    byKind: KindSpend[];
    remainingUsd: number | null;
    capUsd: number;
    lowCreditPercent: number;
    lowCredit: boolean;
    /** The text pool: the host serving text now (`openrouter`, `venice` or `free`); null for the image pool. */
    host?: string | null;
    /**
     * This month's prompt cache (.scratch/prompt-cache/spec.md): the prompt tokens of the calls whose
     * host reported it, and how many of those it read from its cache; null while none did.
     */
    cache?: { promptTokens: number; cachedTokens: number } | null;
    /**
     * This month's spend per model and per host, most spent first (.scratch/cost-view/spec.md). The
     * Owner's only: empty for a Member.
     */
    byModel?: NamedSpend[];
    byHost?: NamedSpend[];
}

/** One model's, or one host's, share of a pool's spend this month, with its prompt cache. */
export interface NamedSpend {
    name: string;
    spentUsd: number;
    calls: number;
    cache: { promptTokens: number; cachedTokens: number } | null;
}

/** How the Usage page names the host serving text (.scratch/text-fallback/spec.md). */
export const TEXT_HOST_LABEL: Record<string, string> = { openrouter: 'OpenRouter', venice: 'Venice', free: 'free model on OpenRouter' };

export interface UsageResponse {
    month: string;
    pools: Record<CreditPool, PoolUsage>;
    /** A Member's Monthly cap (.scratch/accounts/spec.md); null for the Owner. */
    monthlyCap: { capUsd: number; spentUsd: number; reached: boolean } | null;
    /** This month's repairs to replies, by kind and play model (.scratch/reply-repair/spec.md); left out by an API from before them. */
    repairs?: RepairCount[];
}

export type RepairKind = 'speech_lines' | 'line' | 'pressing_note';

/** The repairs of one kind and play model: how many the app made, and how many it weighed and left. */
export interface RepairCount {
    kind: RepairKind;
    /** The play model that wrote the replies; null for a Member, whose counts are of every model together. */
    model: string | null;
    made: number;
    refused: number;
}

/** What each repair is, in the user's words. */
export const REPAIR_KIND_LABEL: Record<RepairKind, string> = {
    speech_lines: 'Quoted speech given back to its Character',
    line: 'A line said again more plainly',
    pressing_note: 'A Character told not to ask again',
};

/** The Venice pool is named for everything it pays for; its id stays `image` (.scratch/dictation/spec.md). */
export const POOL_LABEL: Record<CreditPool, string> = { text: 'Text', image: 'Images and audio (Venice)' };

/** Dollars to the cent; a non-zero amount under a cent shows as "<$0.01", so small spend is never "$0.00". */
export function usd(amount: number): string {
    if (amount > 0 && amount < 0.01) return '<$0.01';
    return `$${amount.toFixed(2)}`;
}

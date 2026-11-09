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
    | 'write_for_me'
    | 'thai_reading'
    | 'snapshot_image'
    | 'reference_image'
    | 'expression_image'
    | 'document_embedding'
    | 'document_search'
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
    write_for_me: 'Write for me',
    thai_reading: 'Thai readings',
    snapshot_image: 'Snapshots',
    reference_image: 'Reference images',
    expression_image: 'Expression pictures',
    document_embedding: 'Document adding',
    document_search: 'Document search',
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
}

export interface UsageResponse {
    month: string;
    pools: Record<CreditPool, PoolUsage>;
}

/** The Venice pool is named for everything it pays for; its id stays `image` (.scratch/dictation/spec.md). */
export const POOL_LABEL: Record<CreditPool, string> = { text: 'Text', image: 'Images and audio (Venice)' };

/** Dollars to the cent; a non-zero amount under a cent shows as "<$0.01", so small spend is never "$0.00". */
export function usd(amount: number): string {
    if (amount > 0 && amount < 0.01) return '<$0.01';
    return `$${amount.toFixed(2)}`;
}

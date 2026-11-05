// Response shapes of the API routes the pages read. Keep in step with apps/api's DTOs.

export type CreditPool = 'text' | 'image';

export interface Settings {
    playModel: string;
    imageModel: string;
    textLowCreditPercent: number;
    imageLowCreditPercent: number;
    textCreditCapUsd: number;
    imageCreditCapUsd: number;
    updatedAt: string;
}

export interface ModelOption {
    id: string;
    label: string;
}

export interface SettingsResponse {
    settings: Settings;
    playModels: ModelOption[];
    imageModels: ModelOption[];
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
    | 'snapshot_image'
    | 'reference_image';

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
    snapshot_image: 'Snapshots',
    reference_image: 'Reference images',
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

export const POOL_LABEL: Record<CreditPool, string> = { text: 'Text', image: 'Image' };

export function usd(amount: number): string {
    return `$${amount.toFixed(2)}`;
}

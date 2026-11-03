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

export interface PoolUsage {
    spentUsd: number;
    calls: number;
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

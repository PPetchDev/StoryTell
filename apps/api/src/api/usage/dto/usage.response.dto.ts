import { ApiProperty } from '@nestjs/swagger';

import { PoolUsage, UsageSummary } from '../../../manager/usage/usage.service.js';

import type { KindSpend } from '../../../model/usage-record/usage-record.service.js';
import type { CallKind } from '../../../service/model-gateway/model-gateway.js';

/** Every call kind, for the docs; a Record so a new kind fails the typecheck until it is listed. */
const CALL_KINDS = Object.keys({
    turn: true,
    judge: true,
    memory_extraction: true,
    story_draft: true,
    field_rewrite: true,
    story_assistant: true,
    snapshot_prompt: true,
    suggested_replies: true,
    story_summary: true,
    write_for_me: true,
    thai_reading: true,
    snapshot_image: true,
    reference_image: true,
    document_embedding: true,
    document_search: true,
} satisfies Record<CallKind, true>);

export class KindSpendDTO implements KindSpend {
    @ApiProperty({ enum: CALL_KINDS, description: 'The call kind the usage records were written under.' })
    kind: CallKind;

    @ApiProperty({ description: "This month's spend on calls of this kind, in USD." })
    spentUsd: number;

    @ApiProperty({ description: 'How many calls of this kind the pool served this month.' })
    calls: number;
}

export class PoolUsageDTO implements PoolUsage {
    @ApiProperty({ description: "This month's spend for the pool, the sum of its usage records, in USD." })
    spentUsd: number;

    @ApiProperty({ description: 'How many model calls the pool served this month.' })
    calls: number;

    @ApiProperty({
        type: [KindSpendDTO],
        description: "This month's spend per call kind, most spent first. Kinds with no calls this month are left out.",
    })
    byKind: KindSpendDTO[];

    @ApiProperty({
        description: 'Remaining credit read from the provider, in USD. Null when it cannot be read.',
        nullable: true,
        type: Number,
    })
    remainingUsd: number | null;

    @ApiProperty({ description: 'What the pool holds when topped up (Settings), in USD.' })
    capUsd: number;

    @ApiProperty({ description: 'The low-credit threshold (Settings), percent of the cap.' })
    lowCreditPercent: number;

    @ApiProperty({ description: 'True when remaining credit is known and at or below the threshold.' })
    lowCredit: boolean;
}

export class UsagePoolsDTO {
    @ApiProperty({ description: 'The OpenRouter text pool.', type: PoolUsageDTO })
    text: PoolUsageDTO;

    @ApiProperty({ description: 'The Venice image pool.', type: PoolUsageDTO })
    image: PoolUsageDTO;
}

export class UsageResponseBodyDTO implements UsageSummary {
    @ApiProperty({ description: 'The month the spend covers, as YYYY-MM.', example: '2026-11' })
    month: string;

    @ApiProperty({ description: 'Spend, remaining credit and the low-credit state per pool.', type: UsagePoolsDTO })
    pools: UsagePoolsDTO;
}

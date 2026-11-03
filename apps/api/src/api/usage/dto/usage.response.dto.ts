import { ApiProperty } from '@nestjs/swagger';

import { PoolUsage, UsageSummary } from '../../../manager/usage/usage.service.js';

export class PoolUsageDTO implements PoolUsage {
    @ApiProperty({ description: "This month's spend for the pool, the sum of its usage records, in USD." })
    spentUsd: number;

    @ApiProperty({ description: 'How many model calls the pool served this month.' })
    calls: number;

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

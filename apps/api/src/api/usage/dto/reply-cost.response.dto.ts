import { ApiProperty } from '@nestjs/swagger';

import { CALL_KINDS, PromptCacheSpendDTO } from './usage.response.dto.js';

import type { ChatCosts } from '../../../manager/usage/reply-cost.service.js';
import type { ReplyCost, ReplyKindCost } from '../../../model/usage-record/usage-record.service.js';
import type { CallKind } from '../../../service/model-gateway/model-gateway.js';

export class ReplyKindCostDTO implements ReplyKindCost {
    @ApiProperty({ enum: CALL_KINDS, description: 'The call kind.' })
    kind: CallKind;

    @ApiProperty({ description: 'What the calls of this kind cost, in USD.' })
    costUsd: number;

    @ApiProperty({ description: 'How many calls of this kind the reply caused.' })
    calls: number;

    @ApiProperty({ type: PromptCacheSpendDTO, nullable: true, description: 'Their prompt cache over the calls that reported one; null when none did.' })
    cache: PromptCacheSpendDTO | null;
}

export class ReplyCostDTO implements ReplyCost {
    @ApiProperty({ description: 'The AI Message.' })
    messageId: number;

    @ApiProperty({ description: 'Everything the reply caused, every Reply version included, in USD.' })
    costUsd: number;

    @ApiProperty({ description: 'How many calls it caused.' })
    calls: number;

    @ApiProperty({ type: [ReplyKindCostDTO], description: 'By call kind, most spent first.' })
    byKind: ReplyKindCostDTO[];
}

export class ChatCostsResponseBodyDTO implements ChatCosts {
    @ApiProperty()
    chatId: number;

    @ApiProperty({ type: [ReplyCostDTO], description: 'Each AI Message with any recorded calls, oldest first (.scratch/cost-view/spec.md).' })
    messages: ReplyCostDTO[];
}

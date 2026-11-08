import { ApiProperty } from '@nestjs/swagger';

import type { InPlayReason, LeftOutReason, LoreInPlay } from '../../../manager/chat/lore/lore-select.js';

export class LoreInPlayEntryDTO {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;

    @ApiProperty({ description: 'Sent on every turn, whether or not it comes up.' })
    alwaysOn: boolean;

    @ApiProperty({ description: 'The share of the times it comes up that it goes in, 0–100; 100 means no roll.' })
    chance: number;

    @ApiProperty({
        description:
            'Why it is in play: `{ kind: "always" }`, `{ kind: "cameUp", trigger, messagesAgo }` (0 = the newest scanned Message), `{ kind: "staying", messagesLeft }` or `{ kind: "broughtIn", byName }`.',
        type: 'object',
        additionalProperties: true,
    })
    why: InPlayReason;
}

export class LoreLeftOutEntryDTO {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;

    @ApiProperty({
        description:
            'Why it came up but was left out: `condition`, `waiting`, `resting`, `chance`, `group` or `noRoom` (spec: "Lore in play").',
        type: 'object',
        additionalProperties: true,
    })
    why: LeftOutReason;
}

/** Spec: "Lore in play": the selection at the point after the newest Message, as a Continue would see it, with reasons. */
export class LoreInPlayResponseBodyDTO implements LoreInPlay {
    @ApiProperty({ type: [LoreInPlayEntryDTO], description: 'In the block’s order: Always include, staying, came up by recency, brought in.' })
    entries: LoreInPlayEntryDTO[];

    @ApiProperty({ type: [LoreLeftOutEntryDTO], description: 'The candidates at this point that did not go in.' })
    leftOut: LoreLeftOutEntryDTO[];
}

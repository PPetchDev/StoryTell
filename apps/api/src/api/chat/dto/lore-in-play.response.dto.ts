import { ApiProperty } from '@nestjs/swagger';

import type { LoreInPlay } from '../../../manager/chat/chat.service.js';

export class LoreInPlayEntryDTO {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;

    @ApiProperty({ description: 'Sent on every turn, whether or not it comes up.' })
    alwaysOn: boolean;
}

/** Spec: "Lore in play": the entries a turn would send now, as a Continue would. */
export class LoreInPlayResponseBodyDTO implements LoreInPlay {
    @ApiProperty({ type: [LoreInPlayEntryDTO], description: 'In the order the turn sends them: Always include first, then the most recently mentioned.' })
    entries: LoreInPlayEntryDTO[];
}

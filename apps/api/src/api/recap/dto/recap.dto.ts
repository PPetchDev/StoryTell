import { ApiProperty } from '@nestjs/swagger';

import type { RecapEntryView, RecapView } from '../../../manager/recap/recap.service.js';

export class RecapEntryDTO implements RecapEntryView {
    @ApiProperty({ description: "The Message it tells the story up to: the Chat's newest." })
    messageId: number;

    @ApiProperty({ description: 'Three to five sentences of where the story stands.' })
    text: string;

    @ApiProperty({ description: 'The user put it away: it no longer shows by itself until the next gap.' })
    dismissed: boolean;

    @ApiProperty()
    writtenAt: string;
}

/** "Previously on…" (.scratch/previously-on/spec.md). */
export class RecapResponseBodyDTO implements RecapView {
    @ApiProperty({ description: 'It should show by itself now: 6 hours or more since the newest Message, something to recap, and not dismissed.' })
    due: boolean;

    @ApiProperty({ type: RecapEntryDTO, nullable: true, description: 'The stored Recap for the newest Message; null with none.' })
    recap: RecapEntryDTO | null;
}

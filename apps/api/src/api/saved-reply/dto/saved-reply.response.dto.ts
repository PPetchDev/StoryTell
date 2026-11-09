import { ApiProperty } from '@nestjs/swagger';

import type { TraySavedReply } from '../../../manager/saved-reply/tray.js';
import type { SavedReplyResponse } from '../../../model/saved-reply/entities/saved-reply.entity.js';

export class SavedReplyDTO implements SavedReplyResponse {
    @ApiProperty()
    id: number;

    @ApiProperty()
    text: string;
}

export class TraySavedReplyDTO extends SavedReplyDTO implements TraySavedReply {
    @ApiProperty({ enum: ['story', 'app'], description: "`story`: this Story's own; `app`: for all Stories." })
    scope: 'story' | 'app';
}

export class ListSavedRepliesResponseBodyDTO {
    @ApiProperty({ type: [SavedReplyDTO], description: 'The app-wide Saved replies, in add order.' })
    savedReplies: SavedReplyDTO[];
}

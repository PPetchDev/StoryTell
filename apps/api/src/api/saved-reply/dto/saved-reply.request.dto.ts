import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

import { SAVED_REPLY_TEXT_MAX } from '../../../model/saved-reply/entities/saved-reply.entity.js';

export class SavedReplyRequestBodyDTO {
    @ApiProperty({
        maxLength: SAVED_REPLY_TEXT_MAX,
        description: 'The line, trimmed when stored. `{user}` stays literal; the tray fills it in. Blank is `EmptySavedReplyError`.',
        example: '*leans back and listens*',
    })
    @IsString()
    @MaxLength(SAVED_REPLY_TEXT_MAX)
    text: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

import type { StorySoFarAuthor } from '../../../model/chat/entities/chat.entity.js';
import type { StorySoFarView } from '../../../manager/chat/story-so-far/story-so-far.service.js';

// About 500 words is asked for; this refuses a runaway client, not a long account.
const TEXT_MAX = 12_000;

export class SaveStorySoFarRequestBodyDTO {
    @ApiProperty({ description: "The user's own account of the story so far. Its corrections win over later AI rewrites." })
    @IsString()
    @MaxLength(TEXT_MAX)
    text: string;
}

/** Spec: "Story so far", the API. */
export class StorySoFarResponseBodyDTO implements StorySoFarView {
    @ApiProperty()
    chatId: number;

    @ApiProperty({ type: String, nullable: true, description: 'The account; null while the whole Chat still fits and there is none.' })
    text: string | null;

    @ApiProperty({ description: "How many of the Chat's first Messages it covers; 0 while there is none." })
    coveredMessages: number;

    @ApiProperty({ enum: ['ai', 'user'], description: 'Who wrote the current text.' })
    writtenBy: StorySoFarAuthor;

    @ApiProperty({ type: String, nullable: true, description: 'When the current text was written (ISO 8601).' })
    updatedAt: string | null;

    @ApiProperty({ type: String, nullable: true, description: 'Why the last update failed; it is tried again after the next turn. Never blocks a send.' })
    failedReason: string | null;
}

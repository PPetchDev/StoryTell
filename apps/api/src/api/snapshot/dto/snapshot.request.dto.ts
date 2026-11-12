import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { SNAPSHOT_PROMPT_TEXT_MAX } from '../../../manager/snapshot/prompt.js';

// Spec: "an optional one-line hint".
const HINT_MAX = 300;

/** The Snapshot sheet's first step (.scratch/snapshot-prompt-review/spec.md): write the Snapshot prompt. */
export class WriteSnapshotPromptRequestBodyDTO {
    @ApiPropertyOptional({
        description: 'A one-line steer, e.g. "close-up on her face". Character names in it decide who is in frame.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(HINT_MAX)
    hint?: string;

    @ApiPropertyOptional({
        description: "An AI Message of this Chat, for a retake of an earlier moment. Default: the Chat's latest AI Message.",
    })
    @IsOptional()
    @IsInt()
    messageId?: number;
}

/** Draw Snapshot: draws a written Snapshot prompt, as the user left it. */
export class DrawSnapshotRequestBodyDTO {
    @ApiProperty({ description: 'The id of the Chat\'s written Snapshot prompt, from `POST .../snapshot-prompts`.' })
    @IsString()
    @IsNotEmpty()
    promptId: string;

    @ApiProperty({
        description: 'The Snapshot prompt as the user left it, edited or not; trimmed. The fixed rules are added around it.',
        maxLength: SNAPSHOT_PROMPT_TEXT_MAX,
    })
    @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
    @IsString()
    @IsNotEmpty({ message: 'Write what the Snapshot shows before drawing it.' })
    @MaxLength(SNAPSHOT_PROMPT_TEXT_MAX)
    text: string;
}

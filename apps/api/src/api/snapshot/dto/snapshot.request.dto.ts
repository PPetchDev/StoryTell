import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

// Spec: "an optional one-line hint".
const HINT_MAX = 300;

export class TakeSnapshotRequestBodyDTO {
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

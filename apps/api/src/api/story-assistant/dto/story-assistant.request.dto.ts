import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

import type { ApplyChangeSetRequest, InstructRequest } from '../../../manager/story-assistant/story-assistant.service.js';

// An instruction is a line or a paragraph; this only refuses a runaway client.
const INSTRUCTION_MAX = 20_000;

export class InstructStoryRequestBodyDTO implements InstructRequest {
    @ApiProperty({ description: 'What to change, in plain language, e.g. "give Mira a sister".' })
    @IsString()
    @MaxLength(INSTRUCTION_MAX)
    instruction: string;

    @ApiPropertyOptional({
        description:
            'Apply even when the changes remove a Character or Scene. Without it such a change set is answered as `pending`, unapplied.',
    })
    @IsOptional()
    @IsBoolean()
    confirmRemovals?: boolean;
}

export class ApplyChangeSetRequestBodyDTO implements ApplyChangeSetRequest {
    @ApiProperty({
        type: [Object],
        description: 'The change set to apply, as answered in `pending`. Validated against the Story as it is now.',
    })
    @IsArray()
    changes: unknown[];

    @ApiPropertyOptional({ description: 'Required when the changes remove a Character or Scene.' })
    @IsOptional()
    @IsBoolean()
    confirmRemovals?: boolean;
}

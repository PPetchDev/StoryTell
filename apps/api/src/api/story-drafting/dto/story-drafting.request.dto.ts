import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

import { REWRITE_TARGETS } from '../../../manager/story-drafting/story-drafting.service.js';

import type { RewriteRequest, RewriteTarget } from '../../../manager/story-drafting/story-drafting.service.js';

// An idea may be a sentence or pages; this only refuses a runaway client.
const IDEA_MAX = 50_000;

export class DraftStoryRequestBodyDTO {
    @ApiProperty({ description: 'The idea to draft a whole Story from, of any length.' })
    @IsString()
    @MaxLength(IDEA_MAX)
    idea: string;
}

export class RewriteFieldRequestBodyDTO implements RewriteRequest {
    @ApiProperty({ enum: REWRITE_TARGETS, description: 'Which part of the Story holds the field.' })
    @IsIn(REWRITE_TARGETS)
    target: RewriteTarget;

    @ApiPropertyOptional({ description: 'The Character, starting Bond or Scene id; not for story or role.' })
    @IsOptional()
    @IsInt()
    id?: number;

    @ApiProperty({ description: 'The text field to rewrite, e.g. `setting`, `voice` or `moveOnCondition`.' })
    @IsString()
    @MaxLength(50)
    field: string;
}

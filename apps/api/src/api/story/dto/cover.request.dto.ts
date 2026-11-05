import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

import { CoverChoice } from '../../../manager/story/story.service.js';
import { CoverFocus } from '../../../model/story/entities/story.entity.js';

/** Where the Cover is picked from: send exactly one of the two. */
export class ChooseCoverRequestBodyDTO implements CoverChoice {
    @ApiPropertyOptional({ description: "A Snapshot of this Story's Gallery." })
    @IsOptional()
    @IsInt()
    snapshotId?: number;

    @ApiPropertyOptional({ description: "A Character of this Story; their Reference image is shown, and followed when it's replaced." })
    @IsOptional()
    @IsInt()
    characterId?: number;
}

/** The point of the Cover kept in view when a card crops it. */
export class CoverFocusRequestBodyDTO implements CoverFocus {
    @ApiProperty({ description: "Across, as a fraction of the picture's width.", minimum: 0, maximum: 1 })
    @IsNumber()
    @Min(0)
    @Max(1)
    x: number;

    @ApiProperty({ description: "Down, as a fraction of the picture's height.", minimum: 0, maximum: 1 })
    @IsNumber()
    @Min(0)
    @Max(1)
    y: number;
}

/** Swagger's picture of the multipart upload. */
export class UploadCoverRequestBodyDTO {
    @ApiProperty({ type: 'string', format: 'binary', description: 'A PNG, JPEG or WebP picture, at most 15 MB.' })
    image: unknown;
}

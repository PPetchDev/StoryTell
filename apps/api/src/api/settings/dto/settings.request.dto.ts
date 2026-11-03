import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

import { PLAY_MODELS, SNAPSHOT_MODELS } from '../../../service/model-gateway/model-gateway.js';

import type { PlayModel, SnapshotModel } from '../../../service/model-gateway/model-gateway.js';

/** Every field is optional; only the ones sent change. */
export class UpdateSettingsRequestBodyDTO {
    @ApiPropertyOptional({
        description: 'The model that plays turns and writes Stories. Changing it can cause Drift.',
        enum: PLAY_MODELS,
    })
    @IsOptional()
    @IsIn(PLAY_MODELS)
    playModel?: PlayModel;

    @ApiPropertyOptional({ description: 'The Venice model that draws Snapshots.', enum: SNAPSHOT_MODELS })
    @IsOptional()
    @IsIn(SNAPSHOT_MODELS)
    imageModel?: SnapshotModel;

    @ApiPropertyOptional({
        description: 'Warn when remaining text credit is at or below this percent of the text cap.',
        minimum: 0,
        maximum: 100,
        example: 20,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    textLowCreditPercent?: number;

    @ApiPropertyOptional({
        description: 'Warn when remaining image credit is at or below this percent of the image cap.',
        minimum: 0,
        maximum: 100,
        example: 20,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    imageLowCreditPercent?: number;

    @ApiPropertyOptional({
        description: 'What the text pool holds when topped up, in USD.',
        minimum: 0,
        example: 22,
    })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    textCreditCapUsd?: number;

    @ApiPropertyOptional({
        description: 'What the image pool holds when topped up, in USD.',
        minimum: 0,
        example: 8,
    })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    imageCreditCapUsd?: number;
}

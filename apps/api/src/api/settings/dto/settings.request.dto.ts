import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, Max, Min, ValidateIf } from 'class-validator';

import {
    PLAY_MODELS,
    SAMPLER_RANGES,
    SNAPSHOT_MODELS,
    SNAPSHOT_SIZES,
} from '../../../service/model-gateway/model-gateway.js';

import type { PlayModel, SnapshotModel, SnapshotSize } from '../../../service/model-gateway/model-gateway.js';

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
        description: 'How large Snapshots are drawn. 2K only for an image model that lists it in its sizes.',
        enum: SNAPSHOT_SIZES,
    })
    @IsOptional()
    @IsIn(SNAPSHOT_SIZES)
    snapshotSize?: SnapshotSize;

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

export class SamplersPathDTO {
    @ApiProperty({ description: 'The play model whose Sampling changes.', enum: PLAY_MODELS })
    @IsIn(PLAY_MODELS)
    playModel: PlayModel;
}

/**
 * One sampler value: a number sets it, null resets it to default (not sent), absent leaves it.
 * Inclusive range, at most two decimal places.
 */
function SamplerValue(param: keyof typeof SAMPLER_RANGES, description: string): PropertyDecorator {
    const { min, max } = SAMPLER_RANGES[param];
    return (target, key) => {
        ApiPropertyOptional({ description: `${description} ${min}–${max}; null resets it.`, minimum: min, maximum: max, nullable: true, type: Number })(target, key);
        ValidateIf((_, value) => value !== undefined && value !== null)(target, key);
        IsNumber({ maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false })(target, key);
        Min(min)(target, key);
        Max(max)(target, key);
    };
}

/** Only the fields sent change. */
export class UpdateSamplersRequestBodyDTO {
    @SamplerValue('temperature', 'Higher is more surprising, lower more predictable.')
    temperature?: number | null;

    @SamplerValue('minP', 'Trims unlikely word choices; higher trims more.')
    minP?: number | null;

    @SamplerValue('topP', 'Keeps only the likeliest words; lower is narrower.')
    topP?: number | null;

    @SamplerValue('repetitionPenalty', 'Above 1 pushes back on repeated words and details.')
    repetitionPenalty?: number | null;
}

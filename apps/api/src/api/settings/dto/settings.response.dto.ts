import { ApiProperty } from '@nestjs/swagger';

import { PLAY_MODELS, SAMPLER_PARAMS, SNAPSHOT_MODELS, SNAPSHOT_SIZES } from '../../../service/model-gateway/model-gateway.js';

import type { SettingsResponse } from '../../../model/settings/entities/settings.entity.js';
import type {
    PlayModel,
    PlaySamplers,
    SamplerParam,
    SnapshotModel,
    SnapshotSize,
} from '../../../service/model-gateway/model-gateway.js';

export class SettingsDTO implements SettingsResponse {
    @ApiProperty({ description: 'The model that plays turns and writes Stories.', enum: PLAY_MODELS })
    playModel: PlayModel;

    @ApiProperty({ description: 'The Venice model that draws Snapshots.', enum: SNAPSHOT_MODELS })
    imageModel: SnapshotModel;

    @ApiProperty({ description: 'How large Snapshots are drawn.', enum: SNAPSHOT_SIZES })
    snapshotSize: SnapshotSize;

    @ApiProperty({ description: 'Low-credit threshold for the text pool, percent of its cap.' })
    textLowCreditPercent: number;

    @ApiProperty({ description: 'Low-credit threshold for the image pool, percent of its cap.' })
    imageLowCreditPercent: number;

    @ApiProperty({ description: 'What the text pool holds when topped up, in USD.' })
    textCreditCapUsd: number;

    @ApiProperty({ description: 'What the image pool holds when topped up, in USD.' })
    imageCreditCapUsd: number;

    @ApiProperty({
        description:
            'Sampling per play model, as stored: only the values that are set ({ temperature?, minP?, topP?, repetitionPenalty? }); a model with none has no key.',
        example: { 'glm-5.3': { temperature: 0.8 } },
    })
    samplers: PlaySamplers;

    @ApiProperty({ description: 'When Settings were last saved (ISO 8601).' })
    updatedAt: string;
}

export class ModelOptionDTO {
    @ApiProperty({ description: 'The value to send back in Settings.' })
    id: string;

    @ApiProperty({ description: 'Name to show, with the host that serves it.' })
    label: string;
}

export class SnapshotSizeOptionDTO {
    @ApiProperty({ description: 'The size, as sent back in Settings.', enum: SNAPSHOT_SIZES })
    size: SnapshotSize;

    @ApiProperty({ description: 'The list price of one Snapshot at this size, in USD.' })
    priceUsd: number;
}

export class ImageModelOptionDTO extends ModelOptionDTO {
    @ApiProperty({ description: 'The sizes this model draws at, smallest first, each with its price.', type: [SnapshotSizeOptionDTO] })
    sizes: SnapshotSizeOptionDTO[];
}

export class PriceDTO {
    @ApiProperty({ description: 'USD per million input tokens, uncached.' })
    input: number;

    @ApiProperty({ description: 'USD per million output tokens.' })
    output: number;

    @ApiProperty({ description: 'USD per million cached input tokens.' })
    cachedInput: number;
}

export class SamplerOptionDTO {
    @ApiProperty({ description: 'The parameter, as sent to PUT /settings/samplers/:playModel.', enum: SAMPLER_PARAMS })
    param: SamplerParam;

    @ApiProperty({ description: 'The smallest value taken.' })
    min: number;

    @ApiProperty({ description: 'The largest value taken.' })
    max: number;

    @ApiProperty({ description: 'How far the field moves per step.' })
    step: number;

    @ApiProperty({ description: "The maker's suggested value, or null when the maker gives none.", nullable: true, type: Number })
    suggested: number | null;
}

export class PlayModelOptionDTO extends ModelOptionDTO {
    @ApiProperty({
        description: 'The sampler parameters this model is offered, in Settings order, with their ranges.',
        type: [SamplerOptionDTO],
    })
    samplers: SamplerOptionDTO[];

    @ApiProperty({ description: 'List price per million tokens, for display only.', type: PriceDTO })
    priceUsdPerMillion: PriceDTO;

    @ApiProperty({ description: 'Roughly what a long turn costs on this model, in USD, to the cent (at least 0.01).' })
    longTurnUsd: number;
}

export class SettingsResponseBodyDTO {
    @ApiProperty({ description: 'The current Settings.', type: SettingsDTO })
    settings: SettingsDTO;

    @ApiProperty({ description: 'The play models that can be chosen, with their prices.', type: [PlayModelOptionDTO] })
    playModels: PlayModelOptionDTO[];

    @ApiProperty({ description: 'The Snapshot models that can be chosen.', type: [ImageModelOptionDTO] })
    imageModels: ImageModelOptionDTO[];
}

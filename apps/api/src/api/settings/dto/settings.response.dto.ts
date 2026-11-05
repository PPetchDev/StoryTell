import { ApiProperty } from '@nestjs/swagger';

import { PLAY_MODELS, SNAPSHOT_MODELS, SNAPSHOT_SIZES } from '../../../service/model-gateway/model-gateway.js';

import type { SettingsResponse } from '../../../model/settings/entities/settings.entity.js';
import type { PlayModel, SnapshotModel, SnapshotSize } from '../../../service/model-gateway/model-gateway.js';

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

export class SettingsResponseBodyDTO {
    @ApiProperty({ description: 'The current Settings.', type: SettingsDTO })
    settings: SettingsDTO;

    @ApiProperty({ description: 'The play models that can be chosen.', type: [ModelOptionDTO] })
    playModels: ModelOptionDTO[];

    @ApiProperty({ description: 'The Snapshot models that can be chosen.', type: [ImageModelOptionDTO] })
    imageModels: ImageModelOptionDTO[];
}

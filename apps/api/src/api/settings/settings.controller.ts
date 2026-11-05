import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { SettingsManagerService } from '../../manager/settings/settings.service.js';
import { SettingsResponse } from '../../model/settings/entities/settings.entity.js';
import { UpdateSettingsRequestBodyDTO } from './dto/settings.request.dto.js';
import { SNAPSHOT_MODEL_PRICES, SnapshotModel, snapshotSizesOf } from '../../service/model-gateway/model-gateway.js';
import { ImageModelOptionDTO, ModelOptionDTO, SettingsResponseBodyDTO } from './dto/settings.response.dto.js';

const PLAY_MODEL_OPTIONS: ModelOptionDTO[] = [
    { id: 'glm-5.3', label: 'GLM-5.3 (DeepInfra)' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (DeepInfra)' },
];

const IMAGE_MODEL_NAMES: Record<SnapshotModel, string> = {
    'seedream-v4-edit': 'Seedream V4.5 edit',
    'seedream-v5-pro-edit': 'Seedream V5 Pro edit',
    'qwen-edit-uncensored': 'Qwen edit uncensored',
};

const IMAGE_MODEL_OPTIONS: ImageModelOptionDTO[] = (Object.keys(IMAGE_MODEL_NAMES) as SnapshotModel[]).map((id) => ({
    id,
    label: `${IMAGE_MODEL_NAMES[id]} (Venice, $${SNAPSHOT_MODEL_PRICES[id]['1K'].toFixed(2)})`,
    sizes: snapshotSizesOf(id).map((size) => ({ size, priceUsd: SNAPSHOT_MODEL_PRICES[id][size]! })),
}));

@ApiTags('Settings')
@Controller('settings')
export class SettingsApiController {
    constructor(private readonly settingsManager: SettingsManagerService) {}

    @Get()
    @ApiOkResponse({ type: SettingsResponseBodyDTO })
    async get(): Promise<SettingsResponseBodyDTO> {
        return respond(await this.settingsManager.getSettings());
    }

    @Put()
    @ApiOkResponse({ type: SettingsResponseBodyDTO })
    async update(@Body() body: UpdateSettingsRequestBodyDTO): Promise<SettingsResponseBodyDTO> {
        return respond(await this.settingsManager.updateSettings(body));
    }
}

function respond(settings: SettingsResponse): SettingsResponseBodyDTO {
    return { settings, playModels: PLAY_MODEL_OPTIONS, imageModels: IMAGE_MODEL_OPTIONS };
}

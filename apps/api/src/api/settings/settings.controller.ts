import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { playModelOptions } from '../../manager/settings/play-model-options.js';
import { SettingsManagerService } from '../../manager/settings/settings.service.js';
import { SettingsResponse } from '../../model/settings/entities/settings.entity.js';
import { SamplersPathDTO, UpdateSamplersRequestBodyDTO, UpdateSettingsRequestBodyDTO } from './dto/settings.request.dto.js';
import { SNAPSHOT_MODEL_PRICES, SnapshotModel, snapshotSizesOf } from '../../service/model-gateway/model-gateway.js';
import { ImageModelOptionDTO, SettingsResponseBodyDTO } from './dto/settings.response.dto.js';

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

    /** Sampling for one play model. "Reset to defaults" is this with all four null. */
    @Put('samplers/:playModel')
    @ApiOkResponse({ type: SettingsResponseBodyDTO })
    async updateSamplers(
        @Param() path: SamplersPathDTO,
        @Body() body: UpdateSamplersRequestBodyDTO,
    ): Promise<SettingsResponseBodyDTO> {
        return respond(await this.settingsManager.updateSamplers(path.playModel, body));
    }
}

function respond(settings: SettingsResponse): SettingsResponseBodyDTO {
    return { settings, playModels: playModelOptions(), imageModels: IMAGE_MODEL_OPTIONS };
}

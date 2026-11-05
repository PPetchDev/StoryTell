import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { SettingsManagerService } from '../../manager/settings/settings.service.js';
import { SettingsResponse } from '../../model/settings/entities/settings.entity.js';
import { UpdateSettingsRequestBodyDTO } from './dto/settings.request.dto.js';
import { ModelOptionDTO, SettingsResponseBodyDTO } from './dto/settings.response.dto.js';

const PLAY_MODEL_OPTIONS: ModelOptionDTO[] = [
    { id: 'glm-5.3', label: 'GLM-5.3 (DeepInfra)' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro (GMICloud)' },
];

const IMAGE_MODEL_OPTIONS: ModelOptionDTO[] = [
    { id: 'seedream-v4-edit', label: 'Seedream V4.5 edit (Venice, $0.05)' },
    { id: 'seedream-v5-pro-edit', label: 'Seedream V5 Pro edit (Venice, $0.06)' },
    { id: 'qwen-edit-uncensored', label: 'Qwen edit uncensored (Venice, $0.04)' },
];

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

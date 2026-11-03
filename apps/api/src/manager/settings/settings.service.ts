import { Injectable } from '@nestjs/common';

import { SettingsResponse } from '../../model/settings/entities/settings.entity.js';
import { SettingsModelService, SettingsPatch } from '../../model/settings/settings.service.js';

@Injectable()
export class SettingsManagerService {
    constructor(private readonly settingsModel: SettingsModelService) {}

    async getSettings(): Promise<SettingsResponse> {
        return (await this.settingsModel.get()).toResponse();
    }

    async updateSettings(patch: SettingsPatch): Promise<SettingsResponse> {
        return (await this.settingsModel.update(patch)).toResponse();
    }
}

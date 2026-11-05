import { Injectable } from '@nestjs/common';

import { SnapshotSizeNotOfferedError } from '../../errors/image.errors.js';
import { snapshotSizesOf } from '../../service/model-gateway/model-gateway.js';
import { SettingsResponse } from '../../model/settings/entities/settings.entity.js';
import { SettingsModelService, SettingsPatch } from '../../model/settings/settings.service.js';

@Injectable()
export class SettingsManagerService {
    constructor(private readonly settingsModel: SettingsModelService) {}

    async getSettings(): Promise<SettingsResponse> {
        return (await this.settingsModel.get()).toResponse();
    }

    /**
     * A Snapshot size asked for must be one the Snapshot model is offered at. A model change
     * alone, to one without the current size, goes back to 1K.
     */
    async updateSettings(patch: SettingsPatch): Promise<SettingsResponse> {
        const current = await this.settingsModel.get();
        const imageModel = patch.imageModel ?? current.imageModel;
        const sizes = snapshotSizesOf(imageModel);
        const next = { ...patch };
        if (patch.snapshotSize !== undefined) {
            if (!sizes.includes(patch.snapshotSize)) throw new SnapshotSizeNotOfferedError(imageModel, patch.snapshotSize);
        } else if (!sizes.includes(current.snapshotSize)) {
            next.snapshotSize = sizes[0];
        }
        return (await this.settingsModel.update(next)).toResponse();
    }
}

import { Injectable } from '@nestjs/common';

import { SnapshotSizeNotOfferedError } from '../../errors/image.errors.js';
import { SamplerNotOfferedError } from '../../errors/model-gateway.errors.js';
import {
    PLAY_MODEL_CATALOGUE,
    PlayModel,
    SamplerParam,
    snapshotSizesOf,
} from '../../service/model-gateway/model-gateway.js';
import { SettingsResponse } from '../../model/settings/entities/settings.entity.js';
import { SamplersPatch, SettingsModelService, SettingsPatch } from '../../model/settings/settings.service.js';

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

    /**
     * Sets or resets one play model's Sampling. A value for a parameter the model's host does
     * not list is refused; resetting one (null) is always allowed, so "Reset to defaults" can
     * send all four for any model.
     */
    async updateSamplers(model: PlayModel, patch: SamplersPatch): Promise<SettingsResponse> {
        const facts = PLAY_MODEL_CATALOGUE[model];
        for (const [param, value] of Object.entries(patch) as Array<[SamplerParam, number | null | undefined]>) {
            if (typeof value === 'number' && !facts.samplers.includes(param)) {
                throw new SamplerNotOfferedError(facts.name, param);
            }
        }
        return (await this.settingsModel.updateSamplers(model, patch)).toResponse();
    }
}

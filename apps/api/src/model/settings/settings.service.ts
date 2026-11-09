import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
    DEFAULT_PLAY_MODEL,
    DEFAULT_SNAPSHOT_MODEL,
    DEFAULT_SNAPSHOT_SIZE,
    PlayModel,
    SamplerParam,
    SamplerValues,
} from '../../service/model-gateway/model-gateway.js';
import { SETTINGS_ROW_ID, SettingsEntity } from './entities/settings.entity.js';

/** A number sets a value, null resets it to default (not sent), and an absent key leaves it. */
export type SamplersPatch = Partial<Record<SamplerParam, number | null>>;

export type SettingsPatch = Partial<
    Pick<
        SettingsEntity,
        | 'playModel'
        | 'imageModel'
        | 'snapshotSize'
        | 'textLowCreditPercent'
        | 'imageLowCreditPercent'
        | 'textCreditCapUsd'
        | 'imageCreditCapUsd'
    >
>;

/** Spec: a suggested split of the $30 cap is about $22 text and $8 image. */
export const DEFAULT_SETTINGS: SettingsPatch = {
    playModel: DEFAULT_PLAY_MODEL,
    imageModel: DEFAULT_SNAPSHOT_MODEL,
    snapshotSize: DEFAULT_SNAPSHOT_SIZE,
    textLowCreditPercent: 20,
    imageLowCreditPercent: 20,
    textCreditCapUsd: 22,
    imageCreditCapUsd: 8,
};

@Injectable()
export class SettingsModelService {
    constructor(@InjectRepository(SettingsEntity) private readonly settings: Repository<SettingsEntity>) {}

    async get(): Promise<SettingsEntity> {
        const existing = await this.settings.findOneBy({ id: SETTINGS_ROW_ID });
        if (existing) return existing;
        // The migration inserts the row; this only covers a database older than it.
        return this.settings.save(this.settings.create({ id: SETTINGS_ROW_ID, ...DEFAULT_SETTINGS }));
    }

    async update(patch: SettingsPatch): Promise<SettingsEntity> {
        const current = await this.get();
        Object.assign(current, patch);
        return this.settings.save(current);
    }

    /** Changes one play model's Sampling; a model left with no value set loses its key. */
    async updateSamplers(model: PlayModel, patch: SamplersPatch): Promise<SettingsEntity> {
        const current = await this.get();
        const values: SamplerValues = { ...current.samplers[model] };
        for (const [param, value] of Object.entries(patch) as Array<[SamplerParam, number | null | undefined]>) {
            if (value === null) delete values[param];
            else if (value !== undefined) values[param] = value;
        }
        const samplers = { ...current.samplers };
        if (Object.keys(values).length > 0) samplers[model] = values;
        else delete samplers[model];
        current.samplers = samplers;
        return this.settings.save(current);
    }
}

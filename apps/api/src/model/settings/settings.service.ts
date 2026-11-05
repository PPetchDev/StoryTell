import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
    DEFAULT_PLAY_MODEL,
    DEFAULT_SNAPSHOT_MODEL,
    DEFAULT_SNAPSHOT_SIZE,
} from '../../service/model-gateway/model-gateway.js';
import { SETTINGS_ROW_ID, SettingsEntity } from './entities/settings.entity.js';

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
}

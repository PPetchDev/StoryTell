import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

import { decimalColumn } from '../../../store/db/decimal.js';

import type { PlayModel, SnapshotModel, SnapshotSize } from '../../../service/model-gateway/model-gateway.js';

/** The one Settings row, as the API returns it. */
export interface SettingsResponse {
    playModel: PlayModel;
    imageModel: SnapshotModel;
    /** How large Snapshots are drawn; 2K only for a model offered at 2K. */
    snapshotSize: SnapshotSize;
    /** Warn when a pool's remaining credit falls below this share of its cap. */
    textLowCreditPercent: number;
    imageLowCreditPercent: number;
    /** What each prepaid pool holds when topped up; the base the percent is taken of. */
    textCreditCapUsd: number;
    imageCreditCapUsd: number;
    updatedAt: string;
}

export const SETTINGS_ROW_ID = 1;

// One row per app (spec: "Settings (one per app)"), always id 1. The migration inserts it.
@Entity('settings')
export class SettingsEntity {
    @PrimaryColumn({ type: 'integer' })
    id: number;

    @Column({ name: 'play_model', type: 'text' })
    playModel: PlayModel;

    @Column({ name: 'image_model', type: 'text' })
    imageModel: SnapshotModel;

    @Column({ name: 'snapshot_size', type: 'text' })
    snapshotSize: SnapshotSize;

    @Column({ name: 'text_low_credit_percent', type: 'integer' })
    textLowCreditPercent: number;

    @Column({ name: 'image_low_credit_percent', type: 'integer' })
    imageLowCreditPercent: number;

    @Column({ name: 'text_credit_cap_usd', ...decimalColumn(10, 2) })
    textCreditCapUsd: number;

    @Column({ name: 'image_credit_cap_usd', ...decimalColumn(10, 2) })
    imageCreditCapUsd: number;

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
    updatedAt: Date;

    toResponse(): SettingsResponse {
        return {
            playModel: this.playModel,
            imageModel: this.imageModel,
            snapshotSize: this.snapshotSize,
            textLowCreditPercent: this.textLowCreditPercent,
            imageLowCreditPercent: this.imageLowCreditPercent,
            textCreditCapUsd: this.textCreditCapUsd,
            imageCreditCapUsd: this.imageCreditCapUsd,
            updatedAt: this.updatedAt.toISOString(),
        };
    }
}

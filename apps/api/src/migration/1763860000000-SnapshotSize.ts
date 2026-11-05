import { MigrationInterface, QueryRunner } from 'typeorm';

/** Settings: how large a Snapshot is drawn, 1K unless the user picks 2K for a model that has it. */
export class SnapshotSize1763860000000 implements MigrationInterface {
    name = 'SnapshotSize1763860000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "settings"
                ADD "snapshot_size" text NOT NULL DEFAULT '1K' CHECK ("snapshot_size" IN ('1K', '2K'))
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "snapshot_size"`);
    }
}

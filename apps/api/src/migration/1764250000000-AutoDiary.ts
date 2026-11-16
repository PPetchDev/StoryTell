import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Entries the Characters write by themselves (.scratch/diary/spec.md): a Chat can turn them off.
 * On by default, for every Chat there already is.
 */
export class AutoDiary1764250000000 implements MigrationInterface {
    name = 'AutoDiary1764250000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" ADD "auto_diary" boolean NOT NULL DEFAULT true`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "auto_diary"`);
    }
}

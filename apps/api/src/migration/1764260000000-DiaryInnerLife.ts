import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A Diary entry's inner-life line (.scratch/diary/spec.md, "The Narrator reads an inner-life line,
 * never the entry"): how the diarist feels and what they mean to do, never shown. NULL for the
 * entries written before it, which the Narrator then does not read.
 */
export class DiaryInnerLife1764260000000 implements MigrationInterface {
    name = 'DiaryInnerLife1764260000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "diary_entry" ADD "inner_life" text`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "diary_entry" DROP COLUMN "inner_life"`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Read aloud (.scratch/read-aloud/spec.md, "Usage"): speech is priced per character sent, so a
 * UsageRecord can carry how many. Null for every other kind.
 */
export class UsageCharacters1764030000000 implements MigrationInterface {
    name = 'UsageCharacters1764030000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usage_record" ADD "characters" integer`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usage_record" DROP COLUMN "characters"`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lore triggers, "Brought in by other entries" (.scratch/lore-triggers/spec.md: "Recursion"): on
 * by default, so an entry named in the text of an entry already chosen comes along.
 */
export class LoreRecursable1763930000000 implements MigrationInterface {
    name = 'LoreRecursable1763930000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lore_entry" ADD COLUMN "recursable" boolean NOT NULL DEFAULT true`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lore_entry" DROP COLUMN "recursable"`);
    }
}

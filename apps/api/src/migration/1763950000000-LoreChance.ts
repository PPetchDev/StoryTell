import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lore triggers, Chance (.scratch/lore-triggers/spec.md: "Chance"): the share of the times an
 * entry comes up that it goes in. 100 by default, which means no roll, so every existing entry
 * stays as it was.
 */
export class LoreChance1763950000000 implements MigrationInterface {
    name = 'LoreChance1763950000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lore_entry" ADD COLUMN "chance" integer NOT NULL DEFAULT 100 CHECK ("chance" BETWEEN 0 AND 100)`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lore_entry" DROP COLUMN "chance"`);
    }
}

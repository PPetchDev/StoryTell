import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lore triggers, Group (.scratch/lore-triggers/spec.md: "Groups"): at most one entry of a group
 * goes in per turn. Blank means no group, so every existing entry stays as it was.
 */
export class LoreGroup1763960000000 implements MigrationInterface {
    name = 'LoreGroup1763960000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lore_entry" ADD COLUMN "group_name" text NOT NULL DEFAULT ''`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lore_entry" DROP COLUMN "group_name"`);
    }
}

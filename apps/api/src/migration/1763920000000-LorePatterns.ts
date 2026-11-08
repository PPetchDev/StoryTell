import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lore triggers, Patterns (.scratch/lore-triggers/spec.md): regular expressions that bring an
 * entry up like keywords do. None by default, so every existing entry stays as it was.
 */
export class LorePatterns1763920000000 implements MigrationInterface {
    name = 'LorePatterns1763920000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lore_entry" ADD COLUMN "patterns" jsonb NOT NULL DEFAULT '[]'`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lore_entry" DROP COLUMN "patterns"`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lore triggers, Second keywords (.scratch/lore-triggers/spec.md): words an entry also needs, or
 * must not have, besides a keyword that came up. The defaults (none, "also needs") keep every
 * existing entry as it was.
 */
export class LoreSecondaryKeywords1763910000000 implements MigrationInterface {
    name = 'LoreSecondaryKeywords1763910000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "lore_entry"
                ADD COLUMN "secondary_keywords" jsonb NOT NULL DEFAULT '[]',
                ADD COLUMN "secondary_mode" text NOT NULL DEFAULT 'alsoNeeds' CHECK ("secondary_mode" IN ('alsoNeeds', 'unless'))
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lore_entry" DROP COLUMN "secondary_keywords", DROP COLUMN "secondary_mode"`);
    }
}

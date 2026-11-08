import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lore triggers, Stays for / Rests for / Waits until (.scratch/lore-triggers/spec.md: "Timed
 * effects, worked out again every time"): counted in Messages, 0 = off, so every existing entry
 * stays as it was. Nothing is stored per Chat: the state is worked out from the Messages.
 */
export class LoreTimedEffects1763940000000 implements MigrationInterface {
    name = 'LoreTimedEffects1763940000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "lore_entry"
                ADD COLUMN "sticky" integer NOT NULL DEFAULT 0 CHECK ("sticky" BETWEEN 0 AND 50),
                ADD COLUMN "cooldown" integer NOT NULL DEFAULT 0 CHECK ("cooldown" BETWEEN 0 AND 50),
                ADD COLUMN "delay" integer NOT NULL DEFAULT 0 CHECK ("delay" BETWEEN 0 AND 50)
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lore_entry" DROP COLUMN "sticky", DROP COLUMN "cooldown", DROP COLUMN "delay"`);
    }
}

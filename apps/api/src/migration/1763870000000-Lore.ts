import { MigrationInterface, QueryRunner } from 'typeorm';

/** Lore: short notes about a Story's world, sent when their name or a keyword comes up. They go with the Story. */
export class Lore1763870000000 implements MigrationInterface {
    name = 'Lore1763870000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "lore_entry" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "position" integer NOT NULL,
                "name" text NOT NULL DEFAULT '',
                "keywords" jsonb NOT NULL DEFAULT '[]',
                "text" text NOT NULL DEFAULT '',
                "always_on" boolean NOT NULL DEFAULT false
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_lore_entry_story" ON "lore_entry" ("story_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "lore_entry"`);
    }
}

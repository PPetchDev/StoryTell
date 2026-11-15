import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lore sets (.scratch/shared-lore/spec.md): Lore an Account keeps apart from any one Story and
 * links to the Stories that share it. A Lore entry now belongs to a Story or to a set, never both.
 */
export class LoreSets1764240000000 implements MigrationInterface {
    name = 'LoreSets1764240000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "lore_set" (
                "id" SERIAL PRIMARY KEY,
                "user_id" integer NOT NULL REFERENCES "app_user"("id"),
                "name" text NOT NULL DEFAULT '',
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_lore_set_user" ON "lore_set" ("user_id")`);
        await queryRunner.query(`
            CREATE TABLE "story_lore_set" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "lore_set_id" integer NOT NULL REFERENCES "lore_set"("id") ON DELETE CASCADE,
                "position" integer NOT NULL,
                CONSTRAINT "UQ_story_lore_set" UNIQUE ("story_id", "lore_set_id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_story_lore_set_story" ON "story_lore_set" ("story_id")`);
        await queryRunner.query(`CREATE INDEX "idx_story_lore_set_lore_set" ON "story_lore_set" ("lore_set_id")`);
        await queryRunner.query(`ALTER TABLE "lore_entry" ALTER COLUMN "story_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "lore_entry" ADD "lore_set_id" integer REFERENCES "lore_set"("id") ON DELETE CASCADE`);
        await queryRunner.query(`CREATE INDEX "idx_lore_entry_lore_set" ON "lore_entry" ("lore_set_id")`);
        // A Story's own, or a set's: exactly one.
        await queryRunner.query(`ALTER TABLE "lore_entry" ADD CONSTRAINT "chk_lore_entry_owner" CHECK (("story_id" IS NULL) <> ("lore_set_id" IS NULL))`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "lore_entry" DROP CONSTRAINT "chk_lore_entry_owner"`);
        // A set's entries have no Story to go back to.
        await queryRunner.query(`DELETE FROM "lore_entry" WHERE "story_id" IS NULL`);
        await queryRunner.query(`ALTER TABLE "lore_entry" DROP COLUMN "lore_set_id"`);
        await queryRunner.query(`ALTER TABLE "lore_entry" ALTER COLUMN "story_id" SET NOT NULL`);
        await queryRunner.query(`DROP TABLE "story_lore_set"`);
        await queryRunner.query(`DROP TABLE "lore_set"`);
    }
}

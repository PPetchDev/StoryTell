import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The full Story of the authoring module (ticket 21): the Story's own fields, its Role,
 * Characters, StartingBonds and Scenes. Everything under a Story cascades on delete.
 */
export class StoryAuthoring1762400000000 implements MigrationInterface {
    name = 'StoryAuthoring1762400000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "story_pov_enum" AS ENUM ('first', 'second', 'third')`);
        await queryRunner.query(`CREATE TYPE "story_tense_enum" AS ENUM ('past', 'present')`);
        await queryRunner.query(
            `CREATE TYPE "story_reply_length_enum" AS ENUM ('short', 'medium', 'long')`,
        );
        await queryRunner.query(`
            ALTER TABLE "story"
                ADD "setting" text NOT NULL DEFAULT '',
                ADD "opening" text NOT NULL DEFAULT '',
                ADD "pov" "story_pov_enum" NOT NULL DEFAULT 'second',
                ADD "tense" "story_tense_enum" NOT NULL DEFAULT 'past',
                ADD "reply_length" "story_reply_length_enum" NOT NULL DEFAULT 'medium',
                ADD "image_style" text NOT NULL DEFAULT ''
        `);
        await queryRunner.query(`
            CREATE TABLE "role" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL UNIQUE
                    REFERENCES "story"("id") ON DELETE CASCADE,
                "name" text NOT NULL DEFAULT '',
                "description" text NOT NULL DEFAULT ''
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "character" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "position" integer NOT NULL,
                "name" text NOT NULL DEFAULT '',
                "appearance" text NOT NULL DEFAULT '',
                "personality" text NOT NULL DEFAULT '',
                "voice" text NOT NULL DEFAULT '',
                "example_lines" jsonb NOT NULL DEFAULT '[]',
                "background" text NOT NULL DEFAULT '',
                "secrets" text NOT NULL DEFAULT '',
                "arc_directions" text NOT NULL DEFAULT ''
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_character_story" ON "character" ("story_id")`);
        await queryRunner.query(`
            CREATE TABLE "starting_bond" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "from_character_id" integer NOT NULL
                    REFERENCES "character"("id") ON DELETE CASCADE,
                -- NULL means toward the Role.
                "to_character_id" integer REFERENCES "character"("id") ON DELETE CASCADE,
                "label" text NOT NULL DEFAULT '',
                "description" text NOT NULL DEFAULT '',
                CONSTRAINT "chk_starting_bond_not_self"
                    CHECK ("to_character_id" IS NULL OR "to_character_id" <> "from_character_id"),
                -- At most one StartingBond per direction, "toward the Role" included.
                CONSTRAINT "uq_starting_bond_direction"
                    UNIQUE NULLS NOT DISTINCT ("from_character_id", "to_character_id")
            )
        `);
        await queryRunner.query(
            `CREATE INDEX "idx_starting_bond_story" ON "starting_bond" ("story_id")`,
        );
        await queryRunner.query(`
            CREATE TABLE "scene" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "position" integer NOT NULL,
                "name" text NOT NULL DEFAULT '',
                "situation" text NOT NULL DEFAULT '',
                "move_on_condition" text NOT NULL DEFAULT ''
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_scene_story" ON "scene" ("story_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "scene"`);
        await queryRunner.query(`DROP TABLE "starting_bond"`);
        await queryRunner.query(`DROP TABLE "character"`);
        await queryRunner.query(`DROP TABLE "role"`);
        await queryRunner.query(`
            ALTER TABLE "story"
                DROP "setting", DROP "opening", DROP "pov", DROP "tense",
                DROP "reply_length", DROP "image_style"
        `);
        await queryRunner.query(`DROP TYPE "story_reply_length_enum"`);
        await queryRunner.query(`DROP TYPE "story_tense_enum"`);
        await queryRunner.query(`DROP TYPE "story_pov_enum"`);
    }
}

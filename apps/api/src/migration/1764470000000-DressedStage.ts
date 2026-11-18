import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The dressed stage (.scratch/dressed-stage/spec.md):
 * - `place_picture`: a place drawn with no one in it, per Story, place and light, shared by its Chats.
 * - `outfit_sprite`: a Character's stage picture in the outfit the Chat has them in, per emotion.
 * - The Chat's switch, off by default, since it draws on the Venice pool.
 * - "The place" as a Backdrop.
 * Files are under `stage/`; rows go with their Story, Chat or Character.
 */
export class DressedStage1764470000000 implements MigrationInterface {
    name = 'DressedStage1764470000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" ADD "dress_stage" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`
            CREATE TABLE "place_picture" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "place_key" text NOT NULL,
                "light" text NOT NULL CONSTRAINT "chk_place_picture_light" CHECK ("light" IN ('day', 'evening', 'night')),
                "status" text NOT NULL CONSTRAINT "chk_place_picture_status" CHECK ("status" IN ('drawing', 'ready', 'failed')),
                "image_path" text,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "uq_place_picture" UNIQUE ("story_id", "place_key", "light")
            )
        `);
        await queryRunner.query(`
            CREATE TABLE "outfit_sprite" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                "outfit_key" text NOT NULL,
                "emotion" text NOT NULL,
                "status" text NOT NULL CONSTRAINT "chk_outfit_sprite_status" CHECK ("status" IN ('drawing', 'ready', 'failed')),
                "source_path" text,
                "image_path" text,
                "cut_out" boolean NOT NULL DEFAULT false,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "uq_outfit_sprite" UNIQUE ("chat_id", "character_id", "outfit_key", "emotion")
            )
        `);
        await queryRunner.query(`ALTER TYPE "story_backdrop_enum" ADD VALUE IF NOT EXISTS 'place'`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "outfit_sprite"`);
        await queryRunner.query(`DROP TABLE "place_picture"`);
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "dress_stage"`);
        await queryRunner.query(`UPDATE "story" SET "backdrop" = 'none' WHERE "backdrop"::text = 'place'`);
        // Postgres cannot drop an enum value: the type is rebuilt without it.
        await queryRunner.query(`ALTER TABLE "story" ALTER COLUMN "backdrop" DROP DEFAULT`);
        await queryRunner.query(`ALTER TYPE "story_backdrop_enum" RENAME TO "story_backdrop_enum_old"`);
        await queryRunner.query(`CREATE TYPE "story_backdrop_enum" AS ENUM ('none', 'cover', 'snapshot')`);
        await queryRunner.query(`ALTER TABLE "story" ALTER COLUMN "backdrop" TYPE "story_backdrop_enum" USING "backdrop"::text::"story_backdrop_enum"`);
        await queryRunner.query(`ALTER TABLE "story" ALTER COLUMN "backdrop" SET DEFAULT 'none'`);
        await queryRunner.query(`DROP TYPE "story_backdrop_enum_old"`);
    }
}

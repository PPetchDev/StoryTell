import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Places drawn ahead (.scratch/places-ahead/spec.md): `story_place`, a place the author names and
 * describes before play. Its key is the `place_picture` key, so play uses what was drawn ahead.
 */
export class StoryPlaces1764550000000 implements MigrationInterface {
    name = 'StoryPlaces1764550000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "story_place" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "name" text NOT NULL,
                "place_key" text NOT NULL,
                "looks" text NOT NULL DEFAULT '',
                "position" integer NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "uq_story_place" UNIQUE ("story_id", "place_key")
            )
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "story_place"`);
    }
}

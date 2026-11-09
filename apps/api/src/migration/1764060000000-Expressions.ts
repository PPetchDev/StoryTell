import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expressions (.scratch/expressions/spec.md, "Storage"): a Character's picture per emotion, one of
 * seven. `crop` null uses the Portrait's square; `drawn_from` is the Reference image path it was
 * drawn from, null for an upload. The rows go with the Character; their files are deleted by the
 * Story authoring module.
 */
export class Expressions1764060000000 implements MigrationInterface {
    name = 'Expressions1764060000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "character_expression" (
                "id" SERIAL PRIMARY KEY,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                "emotion" text NOT NULL,
                "image_path" text NOT NULL,
                "crop" jsonb,
                "drawn_from" text,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "uq_character_expression_emotion" UNIQUE ("character_id", "emotion"),
                CONSTRAINT "chk_character_expression_emotion"
                    CHECK ("emotion" IN ('joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise'))
            )
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "character_expression"`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

const EMOTIONS = `'joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise', 'teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'`;

/**
 * Your faces (.scratch/your-faces/spec.md): Expressions of the Role and of a Persona, one table with
 * exactly one owner per row, its rows going with that owner; and a Message's face, picked by the user
 * or guessed by the Judge.
 */
export class YourFaces1764510000000 implements MigrationInterface {
    name = 'YourFaces1764510000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "identity_expression" (
                "id" SERIAL PRIMARY KEY,
                "role_id" integer REFERENCES "role"("id") ON DELETE CASCADE,
                "persona_id" integer REFERENCES "persona"("id") ON DELETE CASCADE,
                "emotion" text NOT NULL,
                "image_path" text NOT NULL,
                "crop" jsonb,
                "drawn_from" text,
                "cutout_path" text,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "chk_identity_expression_owner" CHECK (num_nonnulls("role_id", "persona_id") = 1),
                CONSTRAINT "chk_identity_expression_emotion" CHECK ("emotion" IN (${EMOTIONS}))
            )
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_identity_expression_role" ON "identity_expression" ("role_id", "emotion") WHERE "role_id" IS NOT NULL`);
        await queryRunner.query(`CREATE UNIQUE INDEX "uq_identity_expression_persona" ON "identity_expression" ("persona_id", "emotion") WHERE "persona_id" IS NOT NULL`);
        await queryRunner.query(`ALTER TABLE "message" ADD "face" text`);
        await queryRunner.query(`ALTER TABLE "message" ADD "face_by" text`);
        await queryRunner.query(`ALTER TABLE "message" ADD CONSTRAINT "chk_message_face" CHECK ("face" IS NULL OR "face" IN (${EMOTIONS}))`);
        await queryRunner.query(`ALTER TABLE "message" ADD CONSTRAINT "chk_message_face_by" CHECK (("face" IS NULL AND "face_by" IS NULL) OR "face_by" IN ('user', 'judge'))`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "chk_message_face_by"`);
        await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "chk_message_face"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "face_by"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "face"`);
        await queryRunner.query(`DROP TABLE "identity_expression"`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

const BEFORE = `'joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise'`;
const AFTER = `${BEFORE}, 'teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'`;

/**
 * Stage pictures (.scratch/stage-pictures/spec.md): six more emotions for intimate scenes, on an
 * Expression and on a line; an Expression's cut-out (the picture with its background taken away);
 * and the Reference image's cut-out in a table of its own, so a Character autosave never touches it.
 */
export class StagePictures1764460000000 implements MigrationInterface {
    name = 'StagePictures1764460000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "character_expression" DROP CONSTRAINT "chk_character_expression_emotion"`);
        await queryRunner.query(`ALTER TABLE "character_expression" ADD CONSTRAINT "chk_character_expression_emotion" CHECK ("emotion" IN (${AFTER}))`);
        await queryRunner.query(`ALTER TABLE "message_part" DROP CONSTRAINT "chk_message_part_emotion"`);
        await queryRunner.query(`ALTER TABLE "message_part" ADD CONSTRAINT "chk_message_part_emotion" CHECK ("emotion" IN ('neutral', ${AFTER}))`);
        await queryRunner.query(`ALTER TABLE "character_expression" ADD "cutout_path" text`);
        await queryRunner.query(`
            CREATE TABLE "reference_cutout" (
                "character_id" integer PRIMARY KEY REFERENCES "character"("id") ON DELETE CASCADE,
                "image_path" text NOT NULL,
                "cut_from" text NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "reference_cutout"`);
        await queryRunner.query(`ALTER TABLE "character_expression" DROP COLUMN "cutout_path"`);
        await queryRunner.query(`UPDATE "message_part" SET "emotion" = NULL WHERE "emotion" NOT IN ('neutral', ${BEFORE})`);
        await queryRunner.query(`ALTER TABLE "message_part" DROP CONSTRAINT "chk_message_part_emotion"`);
        await queryRunner.query(`ALTER TABLE "message_part" ADD CONSTRAINT "chk_message_part_emotion" CHECK ("emotion" IN ('neutral', ${BEFORE}))`);
        await queryRunner.query(`DELETE FROM "character_expression" WHERE "emotion" NOT IN (${BEFORE})`);
        await queryRunner.query(`ALTER TABLE "character_expression" DROP CONSTRAINT "chk_character_expression_emotion"`);
        await queryRunner.query(`ALTER TABLE "character_expression" ADD CONSTRAINT "chk_character_expression_emotion" CHECK ("emotion" IN (${BEFORE}))`);
    }
}

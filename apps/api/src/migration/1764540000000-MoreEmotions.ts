import { MigrationInterface, QueryRunner } from 'typeorm';

const CHARACTERS_BEFORE = `'joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise', 'teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'`;
const YOURS_BEFORE = `'joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise', 'annoyed', 'thinking', 'teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'`;
const AFTER = `'joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise', 'annoyed', 'thinking', 'smug', 'determined', 'worried', 'hurt', 'tired', 'proud', 'teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'`;

/**
 * More emotions for everyone (.scratch/more-faces/spec.md): smug, determined, worried, hurt, tired
 * and proud for a Character's line and Expression, your faces and a Message's face; and annoyed and
 * thinking, until now your faces only, for the Characters too.
 */
export class MoreEmotions1764540000000 implements MigrationInterface {
    name = 'MoreEmotions1764540000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await this.allow(queryRunner, AFTER, AFTER);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "character_expression" WHERE "emotion" NOT IN (${CHARACTERS_BEFORE})`);
        await queryRunner.query(`UPDATE "message_part" SET "emotion" = NULL WHERE "emotion" NOT IN ('neutral', ${CHARACTERS_BEFORE})`);
        await queryRunner.query(`DELETE FROM "identity_expression" WHERE "emotion" NOT IN (${YOURS_BEFORE})`);
        await queryRunner.query(`UPDATE "message" SET "face" = NULL, "face_by" = NULL WHERE "face" NOT IN (${YOURS_BEFORE})`);
        await this.allow(queryRunner, CHARACTERS_BEFORE, YOURS_BEFORE);
    }

    private async allow(queryRunner: QueryRunner, characters: string, yours: string): Promise<void> {
        await queryRunner.query(`ALTER TABLE "character_expression" DROP CONSTRAINT "chk_character_expression_emotion"`);
        await queryRunner.query(`ALTER TABLE "character_expression" ADD CONSTRAINT "chk_character_expression_emotion" CHECK ("emotion" IN (${characters}))`);
        await queryRunner.query(`ALTER TABLE "message_part" DROP CONSTRAINT "chk_message_part_emotion"`);
        await queryRunner.query(`ALTER TABLE "message_part" ADD CONSTRAINT "chk_message_part_emotion" CHECK ("emotion" IN ('neutral', ${characters}))`);
        await queryRunner.query(`ALTER TABLE "identity_expression" DROP CONSTRAINT "chk_identity_expression_emotion"`);
        await queryRunner.query(`ALTER TABLE "identity_expression" ADD CONSTRAINT "chk_identity_expression_emotion" CHECK ("emotion" IN (${yours}))`);
        await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "chk_message_face"`);
        await queryRunner.query(`ALTER TABLE "message" ADD CONSTRAINT "chk_message_face" CHECK ("face" IS NULL OR "face" IN (${yours}))`);
    }
}

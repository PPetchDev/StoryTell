import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The emotion of a line (.scratch/expressions/spec.md, "On a message part"): what the Judge tagged
 * a speech part with, in the transaction that records its judgement. NULL until tagged, for
 * narration, for the Opening, and for every part written before Expressions.
 */
export class MessagePartEmotion1764070000000 implements MigrationInterface {
    name = 'MessagePartEmotion1764070000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message_part" ADD "emotion" text`);
        await queryRunner.query(`
            ALTER TABLE "message_part" ADD CONSTRAINT "chk_message_part_emotion"
                CHECK ("emotion" IN ('neutral', 'joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise'))
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message_part" DROP COLUMN "emotion"`);
    }
}

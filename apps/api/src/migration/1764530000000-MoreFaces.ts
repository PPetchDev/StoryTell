import { MigrationInterface, QueryRunner } from 'typeorm';

const OLD = `'joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise', 'teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'`;
const NEW = `'joy', 'love', 'embarrassment', 'sadness', 'anger', 'fear', 'surprise', 'annoyed', 'thinking', 'teasing', 'desire', 'flustered', 'longing', 'passion', 'afterglow'`;

/** Two more of your faces (.scratch/more-faces/spec.md): annoyed and thinking, for the Role's and a Persona's Expressions and a Message's face. */
export class MoreFaces1764530000000 implements MigrationInterface {
    name = 'MoreFaces1764530000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await this.allow(queryRunner, NEW);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "identity_expression" WHERE "emotion" IN ('annoyed', 'thinking')`);
        await queryRunner.query(`UPDATE "message" SET "face" = NULL, "face_by" = NULL WHERE "face" IN ('annoyed', 'thinking')`);
        await this.allow(queryRunner, OLD);
    }

    private async allow(queryRunner: QueryRunner, emotions: string): Promise<void> {
        await queryRunner.query(`ALTER TABLE "identity_expression" DROP CONSTRAINT "chk_identity_expression_emotion"`);
        await queryRunner.query(`ALTER TABLE "identity_expression" ADD CONSTRAINT "chk_identity_expression_emotion" CHECK ("emotion" IN (${emotions}))`);
        await queryRunner.query(`ALTER TABLE "message" DROP CONSTRAINT "chk_message_face"`);
        await queryRunner.query(`ALTER TABLE "message" ADD CONSTRAINT "chk_message_face" CHECK ("face" IS NULL OR "face" IN (${emotions}))`);
    }
}

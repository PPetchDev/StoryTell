import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Thai readings (.scratch/write-for-me/spec.md, "Thai reading"): a Message's translation into
 * Thai, kept per fingerprint of the stored text it translated, so each Reply version keeps its
 * own and an edited Message simply stops showing its old one. Never part of the Chat: no prompt
 * and no Transcript reads it. Gone with its Message.
 */
export class ThaiReadings1764000000000 implements MigrationInterface {
    name = 'ThaiReadings1764000000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "thai_reading" (
                "id" SERIAL PRIMARY KEY,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "source_fingerprint" text NOT NULL,
                "text" text NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_thai_reading_message_fingerprint" UNIQUE ("message_id", "source_fingerprint")
            )
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "thai_reading"`);
    }
}

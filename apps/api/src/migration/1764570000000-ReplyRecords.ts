import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two records about replies (.scratch/reply-repair/spec.md): `repair_record`, one row for each
 * repair the app made or refused, which the Usage page counts; and `replaced_reply`, the counts
 * kept of a reply the user replaced with Regenerate, which the play-signals report reads. Neither
 * holds a word of a reply. Both go with their Chat. A repair record outlives its Message (a rewind
 * must not lower the month's count); a replaced reply's record goes with its Message, as the report
 * reads it beside that Message.
 */
export class ReplyRecords1764570000000 implements MigrationInterface {
    name = 'ReplyRecords1764570000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "repair_record" (
                "id" SERIAL PRIMARY KEY,
                "user_id" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "message_id" integer REFERENCES "message"("id") ON DELETE SET NULL,
                "kind" text NOT NULL,
                "made" boolean NOT NULL,
                "model" text NOT NULL
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_repair_record_created_at" ON "repair_record" ("created_at")`);
        await queryRunner.query(`
            CREATE TABLE "replaced_reply" (
                "id" SERIAL PRIMARY KEY,
                "user_id" integer NOT NULL,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "model" text NOT NULL,
                "written_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "replaced_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "no_speech_line" boolean NOT NULL,
                "unknown_speaker" boolean NOT NULL,
                "stage_direction" boolean NOT NULL,
                "shared_phrase" boolean NOT NULL,
                "words" integer NOT NULL,
                "overused" integer NOT NULL
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_repair_record_chat" ON "repair_record" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_repair_record_message" ON "repair_record" ("message_id")`);
        await queryRunner.query(`CREATE INDEX "idx_replaced_reply_message" ON "replaced_reply" ("message_id")`);
        await queryRunner.query(`CREATE INDEX "idx_replaced_reply_chat" ON "replaced_reply" ("chat_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "replaced_reply"`);
        await queryRunner.query(`DROP TABLE "repair_record"`);
    }
}

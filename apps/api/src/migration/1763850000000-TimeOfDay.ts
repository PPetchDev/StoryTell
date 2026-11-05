import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The Story clock: a Chat's Time of day, and the ledger record of each change to it. The
 * `time_of_day` column holds the current value (null until the story makes one clear), so the
 * Chat screen reads it without the ledger. A `time_change` cascades from its causing AI
 * Message like a SceneAdvance, so rollback must undo it before the Messages are deleted.
 */
const TIMES = `('dawn', 'morning', 'noon', 'afternoon', 'evening', 'night')`;

export class TimeOfDay1763850000000 implements MigrationInterface {
    name = 'TimeOfDay1763850000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" ADD "time_of_day" text CHECK ("time_of_day" IN ${TIMES})`);
        await queryRunner.query(`
            CREATE TABLE "time_change" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                -- NULL means the Chat had no time of day yet.
                "from_time" text CHECK ("from_time" IN ${TIMES}),
                "to_time" text NOT NULL CHECK ("to_time" IN ${TIMES}),
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_time_change_chat" ON "time_change" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_time_change_message" ON "time_change" ("message_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "time_change"`);
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "time_of_day"`);
    }
}

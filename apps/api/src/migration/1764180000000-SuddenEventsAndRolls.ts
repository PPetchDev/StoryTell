import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sudden events (.scratch/sudden-events/spec.md) and Rolls (.scratch/roll/spec.md).
 * A Story's Sudden events, the ledger of what each judged reply did to one in a Chat, and the Roll a
 * User Message was sent with. A `sudden_event_step` cascades from its causing AI Message, like a
 * `time_change`, and from its Sudden event, so removing one ends it in every Chat.
 */
export class SuddenEventsAndRolls1764180000000 implements MigrationInterface {
    name = 'SuddenEventsAndRolls1764180000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "sudden_event_direction_enum" AS ENUM ('lower', 'raise')`);
        await queryRunner.query(`
            CREATE TABLE "sudden_event" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "position" integer NOT NULL,
                "name" text NOT NULL DEFAULT '',
                "trigger" text NOT NULL DEFAULT '',
                "gauge" text NOT NULL DEFAULT '',
                "direction" "sudden_event_direction_enum" NOT NULL DEFAULT 'lower',
                "turns" integer NOT NULL DEFAULT 4,
                "success" text NOT NULL DEFAULT '',
                "failure" text NOT NULL DEFAULT ''
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_sudden_event_story" ON "sudden_event" ("story_id")`);
        await queryRunner.query(`
            CREATE TABLE "sudden_event_step" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "sudden_event_id" integer NOT NULL REFERENCES "sudden_event"("id") ON DELETE CASCADE,
                "kind" text NOT NULL CHECK ("kind" IN ('start', 'move', 'success', 'failure')),
                "gauge" integer NOT NULL,
                "turns_left" integer NOT NULL,
                "reason" text NOT NULL DEFAULT '',
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_sudden_event_step_chat" ON "sudden_event_step" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_sudden_event_step_event" ON "sudden_event_step" ("sudden_event_id")`);
        await queryRunner.query(`CREATE INDEX "idx_sudden_event_step_message" ON "sudden_event_step" ("message_id")`);
        // The Roll a User Message was sent with: what the d20 showed and the number it had to reach. NULL: no Roll.
        await queryRunner.query(`ALTER TABLE "message" ADD "roll" smallint CHECK ("roll" BETWEEN 1 AND 20)`);
        await queryRunner.query(`ALTER TABLE "message" ADD "roll_target" smallint`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "roll_target"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "roll"`);
        await queryRunner.query(`DROP TABLE "sudden_event_step"`);
        await queryRunner.query(`DROP TABLE "sudden_event"`);
        await queryRunner.query(`DROP TYPE "sudden_event_direction_enum"`);
    }
}

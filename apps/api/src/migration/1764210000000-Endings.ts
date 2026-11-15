import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Endings (.scratch/endings/spec.md): the Endings an author writes on a Story, the record of a Chat
 * reaching one (against the AI Message whose judgement saw it, like a `sudden_event_step`), and the
 * mark on an AI Message that it is an Epilogue.
 */
export class Endings1764210000000 implements MigrationInterface {
    name = 'Endings1764210000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "ending" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "position" integer NOT NULL,
                "name" text NOT NULL DEFAULT '',
                "condition" text NOT NULL DEFAULT '',
                "epilogue" text NOT NULL DEFAULT ''
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_ending_story" ON "ending" ("story_id")`);
        await queryRunner.query(`
            CREATE TABLE "ending_reached" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "ending_id" integer NOT NULL REFERENCES "ending"("id") ON DELETE CASCADE,
                "reason" text NOT NULL DEFAULT '',
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_ending_reached_chat" ON "ending_reached" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_ending_reached_ending" ON "ending_reached" ("ending_id")`);
        await queryRunner.query(`CREATE INDEX "idx_ending_reached_message" ON "ending_reached" ("message_id")`);
        // An AI Message written as the story's Epilogue: Again writes it as one again.
        await queryRunner.query(`ALTER TABLE "message" ADD "epilogue" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "epilogue"`);
        await queryRunner.query(`DROP TABLE "ending_reached"`);
        await queryRunner.query(`DROP TABLE "ending"`);
    }
}

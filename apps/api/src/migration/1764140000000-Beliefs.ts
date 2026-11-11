import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Beliefs (.scratch/memory-by-meaning/spec.md, "Beliefs"): what one Character of a Chat holds to
 * be true, which may be false, and the ledger of the AI's changes to them. A Belief is active
 * until it has a `given_up_message_id`. It goes with its Chat and its Character; the Memory it
 * contradicts may go first (SET NULL). As with a Memory, an AI-made Belief goes with its causing
 * Message, and `belief_change.belief_id` is a plain reference, so a rollback can put a deleted
 * Belief back under its old id.
 */
export class Beliefs1764140000000 implements MigrationInterface {
    name = 'Beliefs1764140000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "belief" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                "text" text NOT NULL,
                "contradicts_memory_id" integer REFERENCES "memory"("id") ON DELETE SET NULL,
                "written_by" text NOT NULL,
                "message_id" integer REFERENCES "message"("id") ON DELETE CASCADE,
                "given_up_message_id" integer REFERENCES "message"("id") ON DELETE SET NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "chk_belief_written_by" CHECK ("written_by" IN ('ai', 'user'))
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_belief_chat" ON "belief" ("chat_id")`);
        await queryRunner.query(`
            CREATE TABLE "belief_change" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "belief_id" integer NOT NULL,
                "kind" text NOT NULL,
                "before" jsonb,
                "after" jsonb,
                "event" text NOT NULL,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "chk_belief_change_kind" CHECK ("kind" IN ('add', 'update', 'give_up', 'delete'))
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_belief_change_chat" ON "belief_change" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_belief_change_message" ON "belief_change" ("message_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "belief_change"`);
        await queryRunner.query(`DROP TABLE "belief"`);
    }
}

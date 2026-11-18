import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sudden events the story makes up (.scratch/ai-events/spec.md). The author's switch on the Story,
 * and a made-up event kept in `sudden_event` beside the author's: with no Story, its Chat, the AI
 * Message whose judgement proposed it (a rewind of that Message takes it away, its steps with it),
 * what became of the proposal, and the Judge's sentence on why now. An author's event keeps
 * `story_id` and has none of the others.
 */
export class AiEvents1764380000000 implements MigrationInterface {
    name = 'AiEvents1764380000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "story" ADD "ai_events" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "sudden_event" ALTER COLUMN "story_id" DROP NOT NULL`);
        await queryRunner.query(`ALTER TABLE "sudden_event" ADD "chat_id" integer REFERENCES "chat"("id") ON DELETE CASCADE`);
        await queryRunner.query(`ALTER TABLE "sudden_event" ADD "message_id" integer REFERENCES "message"("id") ON DELETE CASCADE`);
        await queryRunner.query(
            `ALTER TABLE "sudden_event" ADD "proposal" text CHECK ("proposal" IN ('offered', 'accepted', 'declined'))`,
        );
        await queryRunner.query(`ALTER TABLE "sudden_event" ADD "reason" text NOT NULL DEFAULT ''`);
        // Exactly one owner: the author's Story, or one Chat with the Message that proposed it.
        await queryRunner.query(`
            ALTER TABLE "sudden_event" ADD CONSTRAINT "chk_sudden_event_owner" CHECK (
                ("story_id" IS NOT NULL AND "chat_id" IS NULL AND "message_id" IS NULL AND "proposal" IS NULL)
                OR ("story_id" IS NULL AND "chat_id" IS NOT NULL AND "message_id" IS NOT NULL AND "proposal" IS NOT NULL)
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_sudden_event_chat" ON "sudden_event" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_sudden_event_message" ON "sudden_event" ("message_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "sudden_event" WHERE "story_id" IS NULL`);
        await queryRunner.query(`DROP INDEX "idx_sudden_event_message"`);
        await queryRunner.query(`DROP INDEX "idx_sudden_event_chat"`);
        await queryRunner.query(`ALTER TABLE "sudden_event" DROP CONSTRAINT "chk_sudden_event_owner"`);
        await queryRunner.query(`ALTER TABLE "sudden_event" DROP COLUMN "reason"`);
        await queryRunner.query(`ALTER TABLE "sudden_event" DROP COLUMN "proposal"`);
        await queryRunner.query(`ALTER TABLE "sudden_event" DROP COLUMN "message_id"`);
        await queryRunner.query(`ALTER TABLE "sudden_event" DROP COLUMN "chat_id"`);
        await queryRunner.query(`ALTER TABLE "sudden_event" ALTER COLUMN "story_id" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "story" DROP COLUMN "ai_events"`);
    }
}

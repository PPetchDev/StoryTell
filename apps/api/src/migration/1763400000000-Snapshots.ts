import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Snapshots and the Gallery (ticket 31). A Snapshot belongs to its Story's Gallery for good:
 * its Chat and Message links are cleared, never cascaded, when the Chat is deleted or the
 * Message is discarded by an edit or a reset (an edited AI Message is cleared by the Chat
 * manager, since the Message itself stays). Each Character drawn is kept as a link plus a
 * stamped name, as speech parts are: removing the Character clears the link, the name stays.
 */
export class Snapshots1763400000000 implements MigrationInterface {
    name = 'Snapshots1763400000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "snapshot" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "chat_id" integer REFERENCES "chat"("id") ON DELETE SET NULL,
                "message_id" integer REFERENCES "message"("id") ON DELETE SET NULL,
                "image_path" text NOT NULL,
                "prompt" text NOT NULL,
                "hint" text NOT NULL DEFAULT '',
                "image_model" text NOT NULL,
                "cost_usd" numeric(12, 6) NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_snapshot_story" ON "snapshot" ("story_id")`);
        await queryRunner.query(`CREATE INDEX "idx_snapshot_chat" ON "snapshot" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_snapshot_message" ON "snapshot" ("message_id")`);
        await queryRunner.query(`
            CREATE TABLE "snapshot_character" (
                "snapshot_id" integer NOT NULL REFERENCES "snapshot"("id") ON DELETE CASCADE,
                "position" integer NOT NULL,
                "character_id" integer REFERENCES "character"("id") ON DELETE SET NULL,
                "character_name" text NOT NULL,
                PRIMARY KEY ("snapshot_id", "position")
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_snapshot_character_character" ON "snapshot_character" ("character_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "snapshot_character"`);
        await queryRunner.query(`DROP TABLE "snapshot"`);
    }
}

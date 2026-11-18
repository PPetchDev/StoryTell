import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bookmarks (.scratch/chat-search/spec.md): one row per bookmarked Message, gone with its Message.
 * No column on "message", so the Message queries and the Branch's Message copy stay as they are.
 */
export class MessageBookmarks1764340000000 implements MigrationInterface {
    name = 'MessageBookmarks1764340000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "message_bookmark" (
                "id" SERIAL PRIMARY KEY,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_message_bookmark_message" UNIQUE ("message_id")
            )
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "message_bookmark"`);
    }
}

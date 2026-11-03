import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Playing (ticket 24): a Story's Chats, their Messages and the ordered parts of an AI
 * Message. Everything cascades from the Story through the Chat. A speech part's link to its
 * Character is cleared when the Character is removed; the stamped name stays.
 */
export class ChatsAndMessages1762800000000 implements MigrationInterface {
    name = 'ChatsAndMessages1762800000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "chat" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "title" text NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "last_played_at" timestamptz NOT NULL DEFAULT now(),
                -- NULL means free play.
                "current_scene_id" integer REFERENCES "scene"("id") ON DELETE SET NULL
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_chat_story" ON "chat" ("story_id")`);
        await queryRunner.query(`CREATE TYPE "message_kind_enum" AS ENUM ('user', 'ai')`);
        await queryRunner.query(`
            CREATE TABLE "message" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "position" integer NOT NULL,
                "kind" "message_kind_enum" NOT NULL,
                -- A User Message's text; NULL for an AI Message, whose text is its parts.
                "text" text,
                -- The identity the user wore, stamped; NULL for an AI Message.
                "identity_name" text,
                -- The model that wrote an AI Message ("author" for the Opening); NULL for a User Message.
                "model" text,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "uq_message_position" UNIQUE ("chat_id", "position")
            )
        `);
        await queryRunner.query(`CREATE TYPE "message_part_kind_enum" AS ENUM ('narration', 'speech')`);
        await queryRunner.query(`
            CREATE TABLE "message_part" (
                "id" SERIAL PRIMARY KEY,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "position" integer NOT NULL,
                "kind" "message_part_kind_enum" NOT NULL,
                -- The speaking Character; NULL for narration, for an unknown speaker, and once
                -- the Character is removed.
                "character_id" integer REFERENCES "character"("id") ON DELETE SET NULL,
                "speaker_name" text,
                "text" text NOT NULL,
                CONSTRAINT "uq_message_part_position" UNIQUE ("message_id", "position")
            )
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "message_part"`);
        await queryRunner.query(`DROP TYPE "message_part_kind_enum"`);
        await queryRunner.query(`DROP TABLE "message"`);
        await queryRunner.query(`DROP TYPE "message_kind_enum"`);
        await queryRunner.query(`DROP TABLE "chat"`);
    }
}

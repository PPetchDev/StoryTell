import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Diary (.scratch/diary/spec.md): the entries a Character wrote in one Chat, each recorded against
 * the AI Message the story stood at. An entry cascades from that Message, like a ledger record,
 * and from its Character and its Chat.
 */
export class DiaryEntries1764200000000 implements MigrationInterface {
    name = 'DiaryEntries1764200000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "diary_entry" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                -- The Time of day and the Place as they stood then; NULL when the Chat knew neither.
                "moment" text,
                "text" text NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_diary_entry_chat" ON "diary_entry" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_diary_entry_message" ON "diary_entry" ("message_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "diary_entry"`);
    }
}

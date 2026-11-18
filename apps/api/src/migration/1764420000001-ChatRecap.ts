import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Previously on…" (.scratch/previously-on/spec.md): each Chat's Recap, at most one, tied to the
 * Message it tells the story up to and gone with it. No existing Chat has one.
 */
export class ChatRecap1764420000001 implements MigrationInterface {
    name = 'ChatRecap1764420000001';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "chat_recap" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "fingerprint" text NOT NULL,
                "text" text NOT NULL,
                "dismissed_at" timestamptz,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_chat_recap_chat" UNIQUE ("chat_id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_chat_recap_message" ON "chat_recap" ("message_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "chat_recap"`);
    }
}

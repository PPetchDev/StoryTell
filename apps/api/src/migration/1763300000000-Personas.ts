import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Personas (ticket 26): the user's app-level identities, Name and Description only. A Chat
 * wears its Story's Role while `persona_id` is NULL, so deleting a worn Persona falls its
 * Chats back to the Role. A User Message keeps the Persona it was written as next to the
 * stamped `identity_name`; the reference is cleared when the Persona goes, the name stays.
 */
export class Personas1763300000000 implements MigrationInterface {
    name = 'Personas1763300000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "persona" (
                "id" SERIAL PRIMARY KEY,
                "name" text NOT NULL,
                "description" text NOT NULL DEFAULT '',
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        // NULL means the Chat wears its Story's Role.
        await queryRunner.query(
            `ALTER TABLE "chat" ADD "persona_id" integer REFERENCES "persona"("id") ON DELETE SET NULL`,
        );
        await queryRunner.query(`CREATE INDEX "idx_chat_persona" ON "chat" ("persona_id")`);
        // The Persona a User Message was written as; NULL for the Role, for an AI Message, and once the Persona is deleted.
        await queryRunner.query(
            `ALTER TABLE "message" ADD "persona_id" integer REFERENCES "persona"("id") ON DELETE SET NULL`,
        );
        await queryRunner.query(`CREATE INDEX "idx_message_persona" ON "message" ("persona_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "persona_id"`);
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "persona_id"`);
        await queryRunner.query(`DROP TABLE "persona"`);
    }
}

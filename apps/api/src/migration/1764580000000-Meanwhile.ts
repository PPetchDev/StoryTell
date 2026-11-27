import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Meanwhile (.scratch/meanwhile/spec.md): what Characters away from the moment did on their own,
 * each against the AI Message it came after, and the Chat's switch, on by default.
 */
export class Meanwhile1764580000000 implements MigrationInterface {
    name = 'Meanwhile1764580000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "meanwhile" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "text" text NOT NULL,
                "memory_id" integer REFERENCES "memory"("id") ON DELETE SET NULL,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_meanwhile_chat" ON "meanwhile" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_meanwhile_message" ON "meanwhile" ("message_id")`);
        await queryRunner.query(`ALTER TABLE "chat" ADD "characters_live" boolean NOT NULL DEFAULT true`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "characters_live"`);
        await queryRunner.query(`DROP TABLE "meanwhile"`);
    }
}

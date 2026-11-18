import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Secret reveals (.scratch/secret-reveals/spec.md): a Character's Secrets one by one, each with the
 * Bond level it needs before the Character will tell it (or none), and the ledger record of a Chat's
 * reply revealing one, against that AI Message, so taking the Message back un-reveals it.
 */
export class SecretReveals1764450000010 implements MigrationInterface {
    name = 'SecretReveals1764450000010';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "character_secret" (
                "id" SERIAL PRIMARY KEY,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                "position" integer NOT NULL,
                "text" text NOT NULL DEFAULT '',
                "axis" text,
                "at_least" smallint,
                CONSTRAINT "character_secret_axis_check" CHECK ("axis" IS NULL OR "axis" IN ('trust', 'affection', 'desire', 'tension')),
                CONSTRAINT "character_secret_level_check" CHECK (("axis" IS NULL) = ("at_least" IS NULL))
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_character_secret_character" ON "character_secret" ("character_id")`);
        await queryRunner.query(`
            CREATE TABLE "secret_reveal" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "secret_id" integer NOT NULL REFERENCES "character_secret"("id") ON DELETE CASCADE,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "uq_secret_reveal_chat_secret" UNIQUE ("chat_id", "secret_id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_secret_reveal_chat" ON "secret_reveal" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_secret_reveal_secret" ON "secret_reveal" ("secret_id")`);
        await queryRunner.query(`CREATE INDEX "idx_secret_reveal_message" ON "secret_reveal" ("message_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "secret_reveal"`);
        await queryRunner.query(`DROP TABLE "character_secret"`);
    }
}

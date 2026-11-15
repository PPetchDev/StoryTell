import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Place, Weather and Outfits (.scratch/info-box/spec.md): the ledger of what each judged reply
 * set. A Chat's current values are its newest records, so there is no column on the Chat to keep
 * in step. A record cascades from its causing AI Message, like a `time_change`, and an Outfit from
 * its Character.
 */
export class DetailChanges1764190000000 implements MigrationInterface {
    name = 'DetailChanges1764190000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "detail_change" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "kind" text NOT NULL CHECK ("kind" IN ('place', 'weather', 'outfit')),
                -- The Character an Outfit is of; NULL for the Place and the Weather.
                "character_id" integer REFERENCES "character"("id") ON DELETE CASCADE,
                "value" text NOT NULL,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_detail_change_chat" ON "detail_change" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_detail_change_message" ON "detail_change" ("message_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "detail_change"`);
    }
}

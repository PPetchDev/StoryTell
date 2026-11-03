import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSettingsAndUsageRecord1762700000000 implements MigrationInterface {
    name = 'CreateSettingsAndUsageRecord1762700000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "settings" (
                "id" integer PRIMARY KEY,
                "play_model" text NOT NULL,
                "image_model" text NOT NULL,
                "text_low_credit_percent" integer NOT NULL,
                "image_low_credit_percent" integer NOT NULL,
                "text_credit_cap_usd" numeric(10,2) NOT NULL,
                "image_credit_cap_usd" numeric(10,2) NOT NULL,
                "updated_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        // The one Settings row. Defaults: spec "Settings, usage and credit" and the $22/$8 split.
        await queryRunner.query(`
            INSERT INTO "settings" (
                "id", "play_model", "image_model",
                "text_low_credit_percent", "image_low_credit_percent",
                "text_credit_cap_usd", "image_credit_cap_usd"
            ) VALUES (1, 'glm-5.3', 'seedream-v4-edit', 20, 20, 22, 8)
        `);
        await queryRunner.query(`
            CREATE TABLE "usage_record" (
                "id" SERIAL PRIMARY KEY,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "kind" text NOT NULL,
                "pool" text NOT NULL,
                "model" text NOT NULL,
                "host" text NOT NULL,
                "prompt_tokens" integer,
                "completion_tokens" integer,
                "images" integer,
                "cost_usd" numeric(12,6) NOT NULL,
                "story_id" integer,
                "chat_id" integer
            )
        `);
        await queryRunner.query(
            `CREATE INDEX "IDX_usage_record_created_at" ON "usage_record" ("created_at")`,
        );
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "usage_record"`);
        await queryRunner.query(`DROP TABLE "settings"`);
    }
}

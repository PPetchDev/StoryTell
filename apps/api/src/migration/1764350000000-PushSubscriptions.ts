import { MigrationInterface, QueryRunner } from 'typeorm';

/** Reply alerts (.scratch/push-alerts/spec.md): each device's Web Push subscription, held by one Account. */
export class PushSubscriptions1764350000000 implements MigrationInterface {
    name = 'PushSubscriptions1764350000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "push_subscription" (
                "id" SERIAL PRIMARY KEY,
                "user_id" integer NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
                "endpoint" text NOT NULL UNIQUE,
                "p256dh" text NOT NULL,
                "auth" text NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_push_subscription_user" ON "push_subscription" ("user_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "push_subscription"`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/** The tables whose rows belong to an Account (.scratch/accounts/spec.md: "Ownership"). */
const OWNED = ['story', 'persona', 'saved_reply', 'replace_rule', 'usage_record'];

/**
 * Accounts (.scratch/accounts/spec.md). Makes the one Owner and gives it everything that exists
 * already, so nothing changes for the Owner. `OWNER_EMAIL` renames the placeholder at start-up.
 */
export class Accounts1764160000000 implements MigrationInterface {
    name = 'Accounts1764160000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "app_user" (
                "id" SERIAL PRIMARY KEY,
                "email" text NOT NULL UNIQUE,
                "supabase_id" uuid UNIQUE,
                "role" text NOT NULL CHECK ("role" IN ('owner', 'member')),
                "monthly_cap_usd" real,
                "disabled" boolean NOT NULL DEFAULT false,
                "removed" boolean NOT NULL DEFAULT false,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        // Exactly one Owner.
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_app_user_one_owner" ON "app_user" ("role") WHERE "role" = 'owner'`);
        await queryRunner.query(`INSERT INTO "app_user" ("email", "role") VALUES ('owner@storytell.local', 'owner')`);

        for (const table of OWNED) {
            await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN "user_id" integer REFERENCES "app_user"("id")`);
            await queryRunner.query(`UPDATE "${table}" SET "user_id" = (SELECT "id" FROM "app_user" WHERE "role" = 'owner')`);
            await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "user_id" SET NOT NULL`);
            await queryRunner.query(`CREATE INDEX "idx_${table}_user" ON "${table}" ("user_id")`);
        }
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        for (const table of OWNED) await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN "user_id"`);
        await queryRunner.query(`DROP TABLE "app_user"`);
    }
}

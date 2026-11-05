import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reply versions (.scratch/swipe/spec.md). The Message row stays the shown version; the takes
 * Regenerate replaced wait in `reply_version`, in the order they were written (`ordinal`).
 * `message.version_ordinal` is the shown version's place, null while it has no others.
 * A Snapshot of a version that is put away follows it through `snapshot.reply_version_id`,
 * and keeps only its Story and Chat once that version is dropped.
 */
export class ReplyVersions1763810000000 implements MigrationInterface {
    name = 'ReplyVersions1763810000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "reply_version" (
                "id" SERIAL PRIMARY KEY,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "ordinal" integer NOT NULL,
                "model" text NOT NULL,
                "parts" jsonb NOT NULL,
                "written_at" timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT "uq_reply_version_ordinal" UNIQUE ("message_id", "ordinal")
            )
        `);
        await queryRunner.query(`ALTER TABLE "message" ADD "version_ordinal" integer`);
        await queryRunner.query(`
            ALTER TABLE "snapshot"
                ADD "reply_version_id" integer REFERENCES "reply_version"("id") ON DELETE SET NULL
        `);
        await queryRunner.query(`CREATE INDEX "idx_snapshot_reply_version" ON "snapshot" ("reply_version_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "idx_snapshot_reply_version"`);
        await queryRunner.query(`ALTER TABLE "snapshot" DROP COLUMN "reply_version_id"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "version_ordinal"`);
        await queryRunner.query(`DROP TABLE "reply_version"`);
    }
}

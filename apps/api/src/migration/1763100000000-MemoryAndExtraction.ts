import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Memory extraction and the Memory drawer (ticket 28). `memory` holds a Chat's facts with who
 * wrote them, whether they are locked or archived and the causing AI Message; `memory_known_by`
 * is the Known-by set, one row per Character, so a removed Character drops out through
 * CASCADE. `memory_change` is the ledger's record of every AI-made change, with the Memory's
 * fields before and after as JSON; its `memory_id` is a plain reference so a deleted Memory's
 * id survives for rollback. The AI Message records the extraction's status beside the judge's.
 *
 * An AI-added Memory cascades from its causing Message, like every ledger record: rollback
 * counts and undoes the records before the Messages are deleted.
 */
export class MemoryAndExtraction1763100000000 implements MigrationInterface {
    name = 'MemoryAndExtraction1763100000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" ADD "memory_status" "background_status_enum"`);
        await queryRunner.query(`ALTER TABLE "message" ADD "memory_error" text`);

        await queryRunner.query(`CREATE TYPE "memory_author_enum" AS ENUM ('ai', 'user')`);
        await queryRunner.query(`
            CREATE TABLE "memory" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "text" text NOT NULL,
                "written_by" "memory_author_enum" NOT NULL,
                "locked" boolean NOT NULL DEFAULT false,
                "archived" boolean NOT NULL DEFAULT false,
                -- NULL when the user wrote it from scratch; such a Memory survives any rewind.
                "message_id" integer REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_memory_chat" ON "memory" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_memory_message" ON "memory" ("message_id")`);

        await queryRunner.query(`
            CREATE TABLE "memory_known_by" (
                "memory_id" integer NOT NULL REFERENCES "memory"("id") ON DELETE CASCADE,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                PRIMARY KEY ("memory_id", "character_id")
            )
        `);

        await queryRunner.query(
            `CREATE TYPE "memory_change_kind_enum" AS ENUM ('add', 'update', 'delete', 'archive', 'known_by')`,
        );
        await queryRunner.query(`
            CREATE TABLE "memory_change" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                -- A plain reference: the Memory may be deleted, and rollback restores it under this id.
                "memory_id" integer NOT NULL,
                "kind" "memory_change_kind_enum" NOT NULL,
                "before" jsonb,
                "after" jsonb,
                "event" text NOT NULL,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_memory_change_chat" ON "memory_change" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_memory_change_message" ON "memory_change" ("message_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "memory_change"`);
        await queryRunner.query(`DROP TYPE "memory_change_kind_enum"`);
        await queryRunner.query(`DROP TABLE "memory_known_by"`);
        await queryRunner.query(`DROP TABLE "memory"`);
        await queryRunner.query(`DROP TYPE "memory_author_enum"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "memory_error"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "memory_status"`);
    }
}

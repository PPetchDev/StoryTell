import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The Bond, Arc and Scene judge and the change ledger (ticket 27). Every AI-made change is a
 * row that names what changed, the value before and after, the story event and the causing
 * AI Message: `bond_change`, `arc_step` and `scene_advance`. Ticket 28 adds MemoryChange.
 * `chat_arc_direction` holds the Arc directions copied into a Chat at start and on reset.
 * The AI Message records the judge's status (pending, done or failed).
 *
 * Everything cascades from the Chat. A Character's Bonds (both ways), Arc steps and copied
 * Arc direction go with the Character (spec: "Remove Character"). A record cascades from its
 * causing Message, so rollback must count and undo records before the Messages are deleted.
 * A SceneAdvance keeps its stamped Scene names when a Scene is removed.
 */
export class JudgeAndLedger1763000000000 implements MigrationInterface {
    name = 'JudgeAndLedger1763000000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "background_status_enum" AS ENUM ('pending', 'done', 'failed')`);
        await queryRunner.query(`ALTER TABLE "message" ADD "judge_status" "background_status_enum"`);
        await queryRunner.query(`ALTER TABLE "message" ADD "judge_error" text`);

        await queryRunner.query(`
            CREATE TABLE "chat_arc_direction" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                "text" text NOT NULL,
                CONSTRAINT "uq_chat_arc_direction" UNIQUE ("chat_id", "character_id")
            )
        `);

        await queryRunner.query(`
            CREATE TABLE "bond_change" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "from_character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                -- NULL means toward the user, whichever Role or Persona is worn.
                "to_character_id" integer REFERENCES "character"("id") ON DELETE CASCADE,
                "label" text NOT NULL,
                "description" text NOT NULL,
                -- NULL when the pair were strangers before this change.
                "before_label" text,
                "before_description" text,
                -- NULL for a StartingBond seed, which no event and no Message caused.
                "event" text,
                "message_id" integer REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_bond_change_chat" ON "bond_change" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_bond_change_message" ON "bond_change" ("message_id")`);

        await queryRunner.query(`
            CREATE TABLE "arc_step" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                "step" text NOT NULL,
                "event" text NOT NULL,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_arc_step_chat" ON "arc_step" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_arc_step_message" ON "arc_step" ("message_id")`);

        await queryRunner.query(`
            CREATE TABLE "scene_advance" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "from_scene_id" integer REFERENCES "scene"("id") ON DELETE SET NULL,
                "from_scene_name" text NOT NULL,
                -- NULL means the Chat moved on from the last Scene into free play.
                "to_scene_id" integer REFERENCES "scene"("id") ON DELETE SET NULL,
                "to_scene_name" text,
                "event" text NOT NULL,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_scene_advance_chat" ON "scene_advance" ("chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_scene_advance_message" ON "scene_advance" ("message_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "scene_advance"`);
        await queryRunner.query(`DROP TABLE "arc_step"`);
        await queryRunner.query(`DROP TABLE "bond_change"`);
        await queryRunner.query(`DROP TABLE "chat_arc_direction"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "judge_error"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "judge_status"`);
        await queryRunner.query(`DROP TYPE "background_status_enum"`);
    }
}

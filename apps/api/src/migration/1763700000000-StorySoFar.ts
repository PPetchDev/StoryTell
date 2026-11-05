import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A Chat's Story so far: the account of the events in its oldest Messages, sent in the turn
 * prompt in place of them. `story_so_far_through` is the position of the last Message it
 * covers; the columns are null (and `story_so_far_by` is 'ai') while there is none.
 * `story_so_far_corrections` is the user's last own text, sent with every rewrite so their
 * corrections keep winning, until a rewind or Reset clears it all.
 * Chat state outside the ledger, like the worn Persona.
 */
export class StorySoFar1763700000000 implements MigrationInterface {
    name = 'StorySoFar1763700000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "chat"
                ADD "story_so_far" text,
                ADD "story_so_far_through" integer,
                ADD "story_so_far_by" text NOT NULL DEFAULT 'ai' CHECK ("story_so_far_by" IN ('ai', 'user')),
                ADD "story_so_far_updated_at" timestamptz,
                ADD "story_so_far_failed" text,
                ADD "story_so_far_corrections" text,
                ADD CONSTRAINT "chk_chat_story_so_far_through"
                    CHECK (("story_so_far" IS NULL) = ("story_so_far_through" IS NULL))
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "chat"
                DROP CONSTRAINT "chk_chat_story_so_far_through",
                DROP COLUMN "story_so_far_corrections",
                DROP COLUMN "story_so_far_failed",
                DROP COLUMN "story_so_far_updated_at",
                DROP COLUMN "story_so_far_by",
                DROP COLUMN "story_so_far_through",
                DROP COLUMN "story_so_far"
        `);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Saved replies (.scratch/saved-replies-and-replace-rules/spec.md): lines the user keeps and the
 * composer's tray puts into the box. `story_id` NULL means app-wide; a Story's own go with it.
 */
export class SavedReplies1764010000000 implements MigrationInterface {
    name = 'SavedReplies1764010000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "saved_reply" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer REFERENCES "story"("id") ON DELETE CASCADE,
                "text" text NOT NULL,
                "position" integer NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_saved_reply_story" ON "saved_reply" ("story_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "saved_reply"`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replace rules (.scratch/saved-replies-and-replace-rules/spec.md): find-and-replace rules for
 * AI Messages as shown and/or my Messages before sending. `story_id` NULL means app-wide; a
 * Story's own go with it. `find` is never trimmed: its spaces are part of the pattern.
 */
export class ReplaceRules1764020000000 implements MigrationInterface {
    name = 'ReplaceRules1764020000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "replace_rule" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer REFERENCES "story"("id") ON DELETE CASCADE,
                "find" text NOT NULL,
                "replace" text NOT NULL DEFAULT '',
                "regex" boolean NOT NULL DEFAULT false,
                "ignore_case" boolean NOT NULL DEFAULT false,
                "on_ai" boolean NOT NULL DEFAULT true,
                "on_mine" boolean NOT NULL DEFAULT false,
                "position" integer NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_replace_rule_story" ON "replace_rule" ("story_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "replace_rule"`);
    }
}

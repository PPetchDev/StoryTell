import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Documents (.scratch/documents/spec.md): longer texts a Story's Chats look things up in by
 * meaning, split into passages whose vectors are a plain `real[]` (no pgvector). Both go with
 * the Story.
 */
export class Documents1763980000000 implements MigrationInterface {
    name = 'Documents1763980000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "story_document" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "title" text NOT NULL,
                "source" text NOT NULL,
                "source_name" text,
                "text" text NOT NULL,
                "characters" integer NOT NULL,
                "embedding_model" text NOT NULL,
                "position" integer NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_story_document_story" ON "story_document" ("story_id")`);
        await queryRunner.query(`
            CREATE TABLE "document_passage" (
                "id" SERIAL PRIMARY KEY,
                "document_id" integer NOT NULL REFERENCES "story_document"("id") ON DELETE CASCADE,
                "story_id" integer NOT NULL,
                "position" integer NOT NULL,
                "text" text NOT NULL,
                "embedding" real[] NOT NULL
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_document_passage_document" ON "document_passage" ("document_id")`);
        await queryRunner.query(`CREATE INDEX "idx_document_passage_story" ON "document_passage" ("story_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "document_passage"`);
        await queryRunner.query(`DROP TABLE "story_document"`);
    }
}

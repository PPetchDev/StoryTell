import { MigrationInterface, QueryRunner } from 'typeorm';

/** Turn a Chat into a novel (.scratch/chat-novel/spec.md): each Book chapter, matched to its Chapter by number. */
export class BookChapters1764430000010 implements MigrationInterface {
    name = 'BookChapters1764430000010';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "book_chapter" (
                "id" SERIAL PRIMARY KEY,
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "number" integer NOT NULL,
                "title" text,
                "text" text,
                "written_by" text NOT NULL DEFAULT 'ai' CONSTRAINT "CHK_book_chapter_written_by" CHECK ("written_by" IN ('ai', 'user')),
                "source_hash" text,
                "scene_name" text,
                "failed" text,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`CREATE UNIQUE INDEX "idx_book_chapter_chat_number" ON "book_chapter" ("chat_id", "number")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "book_chapter"`);
    }
}

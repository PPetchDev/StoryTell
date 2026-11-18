import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Move on, and Chapters (.scratch/scene-chapters/spec.md). A Scene advance says who made it, the
 * Judge (every one so far) or the user; and it carries the summary of the Chapter it ended.
 */
export class SceneChapters1764390000000 implements MigrationInterface {
    name = 'SceneChapters1764390000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "scene_advance" ADD "moved_by" text NOT NULL DEFAULT 'judge' CONSTRAINT "CHK_scene_advance_moved_by" CHECK ("moved_by" IN ('judge', 'user'))`,
        );
        await queryRunner.query(`ALTER TABLE "scene_advance" ADD "chapter_summary" text`);
        await queryRunner.query(
            `ALTER TABLE "scene_advance" ADD "chapter_by" text NOT NULL DEFAULT 'ai' CONSTRAINT "CHK_scene_advance_chapter_by" CHECK ("chapter_by" IN ('ai', 'user'))`,
        );
        await queryRunner.query(`ALTER TABLE "scene_advance" ADD "chapter_failed" text`);
        await queryRunner.query(`ALTER TABLE "scene_advance" ADD "chapter_updated_at" TIMESTAMP WITH TIME ZONE`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "scene_advance" DROP COLUMN "chapter_updated_at"`);
        await queryRunner.query(`ALTER TABLE "scene_advance" DROP COLUMN "chapter_failed"`);
        await queryRunner.query(`ALTER TABLE "scene_advance" DROP COLUMN "chapter_by"`);
        await queryRunner.query(`ALTER TABLE "scene_advance" DROP COLUMN "chapter_summary"`);
        await queryRunner.query(`ALTER TABLE "scene_advance" DROP COLUMN "moved_by"`);
    }
}

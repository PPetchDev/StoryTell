import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Memory by meaning (.scratch/memory-by-meaning/spec.md, "Choosing Memories for a turn"): what a
 * turn's Memory choice sent, for "In play" in the Memory drawer (`memories_used`), and the turn's
 * search query as a vector with its model (`context_query`), so Suggested replies, Write for me
 * and Snapshots make the same choice with the same query and no call of their own. All NULL on
 * Messages no turn wrote, and on turns from before.
 */
export class MemoriesUsed1764130000000 implements MigrationInterface {
    name = 'MemoriesUsed1764130000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" ADD COLUMN "memories_used" jsonb`);
        await queryRunner.query(`ALTER TABLE "message" ADD COLUMN "context_query" real[]`);
        await queryRunner.query(`ALTER TABLE "message" ADD COLUMN "context_query_model" text`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "context_query_model"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "context_query"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "memories_used"`);
    }
}

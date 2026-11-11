import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Memory by meaning (.scratch/memory-by-meaning/spec.md, "Embedding Memories"): each Memory gets a
 * vector, as a Document passage has, as a plain `real[]` at unit length (no pgvector), and the
 * model that made it. Both null until it is embedded, and again once its text changes.
 */
export class MemoryEmbedding1764120000000 implements MigrationInterface {
    name = 'MemoryEmbedding1764120000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "memory" ADD COLUMN "embedding" real[]`);
        await queryRunner.query(`ALTER TABLE "memory" ADD COLUMN "embedding_model" text`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "memory" DROP COLUMN "embedding_model"`);
        await queryRunner.query(`ALTER TABLE "memory" DROP COLUMN "embedding"`);
    }
}

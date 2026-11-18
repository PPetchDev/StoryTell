import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Prompt cache (.scratch/prompt-cache/spec.md): of a text call's prompt tokens, those the host
 * read from its cache, kept on its usage record. Null on the records from before, and wherever
 * the host reported nothing about its cache.
 */
export class UsageCachedTokens1764295000000 implements MigrationInterface {
    name = 'UsageCachedTokens1764295000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usage_record" ADD "cached_tokens" integer`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usage_record" DROP COLUMN "cached_tokens"`);
    }
}

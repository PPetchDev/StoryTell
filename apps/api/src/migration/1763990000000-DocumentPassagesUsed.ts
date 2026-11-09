import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * What a turn's Document search found (.scratch/documents/spec.md: "What a turn used"): on the
 * AI Message it wrote, `{ status: 'found' | 'failed', passageIds }`, or NULL when the Story had
 * no Documents. A Branch copies it with the Message.
 */
export class DocumentPassagesUsed1763990000000 implements MigrationInterface {
    name = 'DocumentPassagesUsed1763990000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" ADD "document_passages" jsonb`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "document_passages"`);
    }
}

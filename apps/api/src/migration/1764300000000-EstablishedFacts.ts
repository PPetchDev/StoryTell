import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Established facts and slips (.scratch/story-quality/spec.md): two more kinds of detail record,
 * so the ledger keeps, rolls back and copies them as it does the others.
 */
export class EstablishedFacts1764300000000 implements MigrationInterface {
    name = 'EstablishedFacts1764300000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "detail_change" DROP CONSTRAINT IF EXISTS "detail_change_kind_check"`);
        await queryRunner.query(
            `ALTER TABLE "detail_change" ADD CONSTRAINT "detail_change_kind_check" CHECK ("kind" IN ('place', 'weather', 'outfit', 'goal', 'fact', 'slip'))`,
        );
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "detail_change" WHERE "kind" IN ('fact', 'slip')`);
        await queryRunner.query(`ALTER TABLE "detail_change" DROP CONSTRAINT IF EXISTS "detail_change_kind_check"`);
        await queryRunner.query(`ALTER TABLE "detail_change" ADD CONSTRAINT "detail_change_kind_check" CHECK ("kind" IN ('place', 'weather', 'outfit', 'goal'))`);
    }
}

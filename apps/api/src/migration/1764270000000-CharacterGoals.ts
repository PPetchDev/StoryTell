import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Character Goals (.scratch/character-minds/spec.md): a fourth kind of detail record, per Character
 * like an Outfit, so the ledger keeps, rolls back and copies them as it does the others.
 */
export class CharacterGoals1764270000000 implements MigrationInterface {
    name = 'CharacterGoals1764270000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "detail_change" DROP CONSTRAINT IF EXISTS "detail_change_kind_check"`);
        await queryRunner.query(`ALTER TABLE "detail_change" ADD CONSTRAINT "detail_change_kind_check" CHECK ("kind" IN ('place', 'weather', 'outfit', 'goal'))`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "detail_change" WHERE "kind" = 'goal'`);
        await queryRunner.query(`ALTER TABLE "detail_change" DROP CONSTRAINT IF EXISTS "detail_change_kind_check"`);
        await queryRunner.query(`ALTER TABLE "detail_change" ADD CONSTRAINT "detail_change_kind_check" CHECK ("kind" IN ('place', 'weather', 'outfit'))`);
    }
}

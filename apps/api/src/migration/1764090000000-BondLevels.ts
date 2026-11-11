import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bond axes (.scratch/bond-axes/spec.md, "Storage"): each Bond change records the Bond's level on
 * the four Bond axes. Nullable: every existing row is a Bond with no levels yet, which the Judge
 * measures the next time it touches it.
 */
export class BondLevels1764090000000 implements MigrationInterface {
    name = 'BondLevels1764090000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "bond_change" ADD "trust" smallint, ADD "affection" smallint, ADD "desire" smallint, ADD "tension" smallint`,
        );
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "bond_change" DROP COLUMN "tension", DROP COLUMN "desire", DROP COLUMN "affection", DROP COLUMN "trust"`,
        );
    }
}

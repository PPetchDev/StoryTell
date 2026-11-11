import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Starting Bond levels (.scratch/bond-axes/spec.md, "Storage"): each Starting Bond sets where it
 * starts on the four Bond axes. Not null, defaulting to the middle, so every existing Starting
 * Bond reads as 0 on every axis.
 */
export class StartingBondLevels1764100000000 implements MigrationInterface {
    name = 'StartingBondLevels1764100000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "starting_bond" ADD "trust" smallint NOT NULL DEFAULT 0, ADD "affection" smallint NOT NULL DEFAULT 0, ADD "desire" smallint NOT NULL DEFAULT 0, ADD "tension" smallint NOT NULL DEFAULT 0`,
        );
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "starting_bond" DROP COLUMN "tension", DROP COLUMN "desire", DROP COLUMN "affection", DROP COLUMN "trust"`,
        );
    }
}

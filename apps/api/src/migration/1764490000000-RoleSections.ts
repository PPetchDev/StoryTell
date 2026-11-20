import { MigrationInterface, QueryRunner } from 'typeorm';

/** The Role's own sections (.scratch/role-sections/spec.md): a heading and free text each, in order. */
export class RoleSections1764490000000 implements MigrationInterface {
    name = 'RoleSections1764490000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "role" ADD "sections" jsonb NOT NULL DEFAULT '[]'`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "role" DROP COLUMN "sections"`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/** The Role's own picture (.scratch/role-image/spec.md): its path in the image folder, or none. */
export class RoleImage1764500000000 implements MigrationInterface {
    name = 'RoleImage1764500000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "role" ADD "image_path" text`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "role" DROP COLUMN "image_path"`);
    }
}

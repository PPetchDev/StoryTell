import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The face square of the Role's picture and of a Persona's (.scratch/your-faces/spec.md, "Picking the
 * face"): fractions of the picture's width, as a Character's Portrait square; null uses the default.
 */
export class PictureFaces1764520000000 implements MigrationInterface {
    name = 'PictureFaces1764520000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "role" ADD "image_crop" jsonb`);
        await queryRunner.query(`ALTER TABLE "persona" ADD "image_crop" jsonb`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "persona" DROP COLUMN "image_crop"`);
        await queryRunner.query(`ALTER TABLE "role" DROP COLUMN "image_crop"`);
    }
}

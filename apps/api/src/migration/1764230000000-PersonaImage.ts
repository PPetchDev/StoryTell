import { MigrationInterface, QueryRunner } from 'typeorm';

/** Persona image (.scratch/persona-image/spec.md): the picture a Persona owns, as a path in the image folder. */
export class PersonaImage1764230000000 implements MigrationInterface {
    name = 'PersonaImage1764230000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "persona" ADD "image_path" text`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "persona" DROP COLUMN "image_path"`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reference images (ticket 30): the path of a Character's Reference image file, relative to
 * the image folder. NULL while the Character has none. The file itself is deleted by the
 * Story authoring module when the Character or its Story goes, not by the database.
 */
export class CharacterReferenceImage1762900000000 implements MigrationInterface {
    name = 'CharacterReferenceImage1762900000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "character" ADD "reference_image_path" text`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "character" DROP COLUMN "reference_image_path"`);
    }
}

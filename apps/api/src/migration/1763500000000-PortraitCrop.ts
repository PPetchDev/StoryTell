import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The Portrait crop: the square of a Character's Reference image shown beside their lines in a
 * Chat, as `{ x, y, size }` in fractions of the image's width. NULL means none is chosen, and
 * the Chat centres the Reference image. Cleared whenever the Reference image changes.
 */
export class PortraitCrop1763500000000 implements MigrationInterface {
    name = 'PortraitCrop1763500000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "character" ADD "portrait_crop" jsonb`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "character" DROP COLUMN "portrait_crop"`);
    }
}

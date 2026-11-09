import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sampling per play model (.scratch/models-and-samplers/spec.md: "Sampling"). A key is present
 * only for a value that is set, so the empty default sends nothing and every play call stays
 * on the host's defaults, exactly as before.
 */
export class Samplers1763970000000 implements MigrationInterface {
    name = 'Samplers1763970000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settings" ADD COLUMN "samplers" jsonb NOT NULL DEFAULT '{}'`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "samplers"`);
    }
}

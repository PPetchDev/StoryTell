import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suggested Endings (.scratch/endings/spec.md, "An Ending the Judge suggests"): a reaching with no
 * author's Ending behind it carries its own name, and a Chat can stop the Judge suggesting.
 */
export class SuggestedEndings1764220000000 implements MigrationInterface {
    name = 'SuggestedEndings1764220000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "ending_reached" ALTER COLUMN "ending_id" DROP NOT NULL`);
        // A suggested Ending's name; NULL for the author's, which has its own.
        await queryRunner.query(`ALTER TABLE "ending_reached" ADD "name" text`);
        // Off once the user waves a suggested Ending away; Reset turns it on again.
        await queryRunner.query(`ALTER TABLE "chat" ADD "ending_suggestions" boolean NOT NULL DEFAULT true`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "ending_suggestions"`);
        await queryRunner.query(`DELETE FROM "ending_reached" WHERE "ending_id" IS NULL`);
        await queryRunner.query(`ALTER TABLE "ending_reached" DROP COLUMN "name"`);
        await queryRunner.query(`ALTER TABLE "ending_reached" ALTER COLUMN "ending_id" SET NOT NULL`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Read aloud (.scratch/read-aloud/spec.md, "Voices on the Story and its Characters"): a Kokoro
 * voice id per Story for narration (null: the default voice) and per Character for their lines
 * (null: read in the Narration voice).
 */
export class Voices1764040000000 implements MigrationInterface {
    name = 'Voices1764040000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "story" ADD "narration_voice" text`);
        await queryRunner.query(`ALTER TABLE "character" ADD "speaking_voice" text`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "character" DROP COLUMN "speaking_voice"`);
        await queryRunner.query(`ALTER TABLE "story" DROP COLUMN "narration_voice"`);
    }
}

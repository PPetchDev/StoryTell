import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A Japanese dub for Read aloud (.scratch/japanese-dub/spec.md): the Story's language (English as
 * before, or Japanese) and its Japanese narration voice, and each Character's Japanese voice.
 */
export class JapaneseDub1764480000000 implements MigrationInterface {
    name = 'JapaneseDub1764480000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "story" ADD "read_aloud_language" text NOT NULL DEFAULT 'english' CONSTRAINT "chk_story_read_aloud_language" CHECK ("read_aloud_language" IN ('english', 'japanese'))`,
        );
        await queryRunner.query(`ALTER TABLE "story" ADD "dub_narration_voice" text`);
        await queryRunner.query(`ALTER TABLE "character" ADD "dub_voice" text`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "character" DROP COLUMN "dub_voice"`);
        await queryRunner.query(`ALTER TABLE "story" DROP COLUMN "dub_narration_voice"`);
        await queryRunner.query(`ALTER TABLE "story" DROP COLUMN "read_aloud_language"`);
    }
}

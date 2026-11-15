import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Style controls (.scratch/style-controls/spec.md): a Story's pacing, its balance of dialogue and
 * action, and its difficulty. Every Story starts at the middle value of each, which adds nothing
 * to the prompt, so Stories written before this play as they did.
 */
export class StoryStyleControls1764170000000 implements MigrationInterface {
    name = 'StoryStyleControls1764170000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "story_pacing_enum" AS ENUM ('fast', 'natural', 'slow')`);
        await queryRunner.query(`CREATE TYPE "story_balance_enum" AS ENUM ('dialogue', 'balanced', 'action')`);
        await queryRunner.query(`CREATE TYPE "story_difficulty_enum" AS ENUM ('easy', 'normal', 'hard')`);
        await queryRunner.query(`ALTER TABLE "story" ADD "pacing" "story_pacing_enum" NOT NULL DEFAULT 'natural'`);
        await queryRunner.query(`ALTER TABLE "story" ADD "balance" "story_balance_enum" NOT NULL DEFAULT 'balanced'`);
        await queryRunner.query(`ALTER TABLE "story" ADD "difficulty" "story_difficulty_enum" NOT NULL DEFAULT 'normal'`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "story" DROP COLUMN "difficulty"`);
        await queryRunner.query(`ALTER TABLE "story" DROP COLUMN "balance"`);
        await queryRunner.query(`ALTER TABLE "story" DROP COLUMN "pacing"`);
        await queryRunner.query(`DROP TYPE "story_difficulty_enum"`);
        await queryRunner.query(`DROP TYPE "story_balance_enum"`);
        await queryRunner.query(`DROP TYPE "story_pacing_enum"`);
    }
}

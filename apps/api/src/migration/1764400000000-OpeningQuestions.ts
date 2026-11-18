import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Opening questions (.scratch/opening-questions/spec.md): the questions a Story asks when a Chat
 * starts, and the answers one Chat gave. Every existing Story asks none and every existing Chat
 * has none, so nothing they show or send changes.
 */
export class OpeningQuestions1764400000000 implements MigrationInterface {
    name = 'OpeningQuestions1764400000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "story" ADD "opening_questions" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "chat" ADD "opening_answers" jsonb`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "opening_answers"`);
        await queryRunner.query(`ALTER TABLE "story" DROP COLUMN "opening_questions"`);
    }
}

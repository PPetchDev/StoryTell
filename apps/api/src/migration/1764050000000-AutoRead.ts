import { MigrationInterface, QueryRunner } from 'typeorm';

/** Read aloud (.scratch/read-aloud/spec.md, "Auto-read"): a Chat can read its new replies aloud by itself. Off by default. */
export class AutoRead1764050000000 implements MigrationInterface {
    name = 'AutoRead1764050000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" ADD "auto_read" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "auto_read"`);
    }
}

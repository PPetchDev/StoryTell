import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStory1762160000000 implements MigrationInterface {
    name = 'CreateStory1762160000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "story" (
                "id" SERIAL PRIMARY KEY,
                "title" text NOT NULL,
                "created_at" timestamptz NOT NULL DEFAULT now(),
                "updated_at" timestamptz NOT NULL DEFAULT now()
            )
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "story"`);
    }
}

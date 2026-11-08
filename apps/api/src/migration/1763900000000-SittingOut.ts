import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sitting out (.scratch/speaker-controls/spec.md): the Characters kept out of one Chat's turns
 * until the user brings them back. One row per Character, so a removed Character or a deleted
 * Chat drops its rows through CASCADE. Chat state outside the ledger.
 */
export class SittingOut1763900000000 implements MigrationInterface {
    name = 'SittingOut1763900000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "chat_sitting_out" (
                "chat_id" integer NOT NULL REFERENCES "chat"("id") ON DELETE CASCADE,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                PRIMARY KEY ("chat_id", "character_id")
            )
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "chat_sitting_out"`);
    }
}

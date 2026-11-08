import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Author's note (.scratch/authors-note/spec.md): the user's standing direction for one Chat.
 * Chat state outside the ledger; empty means no note.
 */
export class AuthorsNote1763890000000 implements MigrationInterface {
    name = 'AuthorsNote1763890000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" ADD COLUMN "authors_note" text NOT NULL DEFAULT ''`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "authors_note"`);
    }
}

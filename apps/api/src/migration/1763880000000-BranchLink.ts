import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Branch (.scratch/branch/spec.md, "The link back"): the Chat a Branch came from, and the Message
 * the user tapped there. Deleting either clears the link and keeps the Branch.
 */
export class BranchLink1763880000000 implements MigrationInterface {
    name = 'BranchLink1763880000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "chat"
                ADD COLUMN "branched_from_chat_id" integer REFERENCES "chat"("id") ON DELETE SET NULL,
                ADD COLUMN "branched_from_message_id" integer REFERENCES "message"("id") ON DELETE SET NULL
        `);
        await queryRunner.query(`CREATE INDEX "idx_chat_branched_from_chat" ON "chat" ("branched_from_chat_id")`);
        await queryRunner.query(`CREATE INDEX "idx_chat_branched_from_message" ON "chat" ("branched_from_message_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "branched_from_message_id", DROP COLUMN "branched_from_chat_id"`);
    }
}

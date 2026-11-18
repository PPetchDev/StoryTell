import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cost view (.scratch/cost-view/spec.md): the AI Message a call served, so a reply can show what it
 * cost. A plain reference like `chat_id`, so the record outlives the Message; null on the records
 * from before and on every call that served no reply.
 */
export class UsageMessage1764330000000 implements MigrationInterface {
    name = 'UsageMessage1764330000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usage_record" ADD "message_id" integer`);
        await queryRunner.query(`CREATE INDEX "IDX_usage_record_chat_message" ON "usage_record" ("chat_id", "message_id") WHERE "message_id" IS NOT NULL`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_usage_record_chat_message"`);
        await queryRunner.query(`ALTER TABLE "usage_record" DROP COLUMN "message_id"`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reach-outs (.scratch/reach-outs/spec.md): a Chat's "Characters message first" setting with the
 * claim that keeps one absence to one Reach-out, and the mark on the AI Message that is one.
 */
export class ReachOuts1764410000010 implements MigrationInterface {
    name = 'ReachOuts1764410000010';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "chat_reach_out" (
                "chat_id" integer PRIMARY KEY REFERENCES "chat"("id") ON DELETE CASCADE,
                "after_hours" smallint NOT NULL CHECK ("after_hours" IN (6, 12, 24)),
                "set_at" timestamptz NOT NULL DEFAULT now(),
                "claimed_for" integer,
                "claimed_at" timestamptz,
                "attempts" smallint NOT NULL DEFAULT 0
            )
        `);
        await queryRunner.query(`ALTER TABLE "message" ADD "reach_out" boolean NOT NULL DEFAULT false`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "reach_out"`);
        await queryRunner.query(`DROP TABLE "chat_reach_out"`);
    }
}

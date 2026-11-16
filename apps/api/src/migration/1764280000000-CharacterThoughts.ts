import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Character Thoughts (.scratch/character-minds/spec.md): what each Character thought before a
 * reply, kept with it, and the Chat's setting that turns them off.
 */
export class CharacterThoughts1764280000000 implements MigrationInterface {
    name = 'CharacterThoughts1764280000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "message_thought" (
                "id" SERIAL PRIMARY KEY,
                "message_id" integer NOT NULL REFERENCES "message"("id") ON DELETE CASCADE,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                "position" integer NOT NULL,
                "text" text NOT NULL
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_message_thought_message" ON "message_thought" ("message_id")`);
        await queryRunner.query(`ALTER TABLE "chat" ADD "character_thoughts" boolean NOT NULL DEFAULT true`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chat" DROP COLUMN "character_thoughts"`);
        await queryRunner.query(`DROP TABLE "message_thought"`);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Chat looks (.scratch/chat-looks/spec.md, "Backdrop"): what sits behind a Story's Chats. `none`
 * (as before), the Story's Cover, or the Chat's newest Snapshot; every Story starts at `none`.
 */
export class StoryBackdrop1764080000000 implements MigrationInterface {
    name = 'StoryBackdrop1764080000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "story_backdrop_enum" AS ENUM ('none', 'cover', 'snapshot')`);
        await queryRunner.query(`ALTER TABLE "story" ADD "backdrop" "story_backdrop_enum" NOT NULL DEFAULT 'none'`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "story" DROP COLUMN "backdrop"`);
        await queryRunner.query(`DROP TYPE "story_backdrop_enum"`);
    }
}

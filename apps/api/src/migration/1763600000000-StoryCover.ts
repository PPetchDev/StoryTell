import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A Story's Cover, the picture its author chose for it. It is at most one of: a Snapshot of the
 * Story's Gallery, a Character's Reference image (both only pointed at, so their files stay
 * theirs), or an uploaded file the Cover owns at `cover_image_path`. A Snapshot or Character
 * that goes takes the pointer with it (SET NULL). `cover_focus` is `{ x, y }`, the point of the
 * picture kept in view when it is cropped, in fractions of its width and height.
 */
export class StoryCover1763600000000 implements MigrationInterface {
    name = 'StoryCover1763600000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "story"
                ADD "cover_snapshot_id" integer REFERENCES "snapshot"("id") ON DELETE SET NULL,
                ADD "cover_character_id" integer REFERENCES "character"("id") ON DELETE SET NULL,
                ADD "cover_image_path" text,
                ADD "cover_focus" jsonb,
                ADD CONSTRAINT "chk_story_one_cover"
                    CHECK (num_nonnulls("cover_snapshot_id", "cover_character_id", "cover_image_path") <= 1)
        `);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "story"
                DROP CONSTRAINT "chk_story_one_cover",
                DROP COLUMN "cover_focus",
                DROP COLUMN "cover_image_path",
                DROP COLUMN "cover_character_id",
                DROP COLUMN "cover_snapshot_id"
        `);
    }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Starting Beliefs (.scratch/memory-by-meaning/spec.md, "Beliefs"): what a Character of a Story
 * believes when a Chat starts, which every new Chat and every Reset seeds as a Belief. They go
 * with their Story and with their Character.
 */
export class StartingBeliefs1764150000000 implements MigrationInterface {
    name = 'StartingBeliefs1764150000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "starting_belief" (
                "id" SERIAL PRIMARY KEY,
                "story_id" integer NOT NULL REFERENCES "story"("id") ON DELETE CASCADE,
                "character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                "text" text NOT NULL
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_starting_belief_story" ON "starting_belief" ("story_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "starting_belief"`);
    }
}

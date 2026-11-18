import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Roll offers and Stats (.scratch/judge-rolls/spec.md): the Role's Stats, the Story's switch for
 * offers, the Stat a Roll was made for, and the Roll offer the Judge left on an AI Message.
 */
export class JudgeRolls1764370000000 implements MigrationInterface {
    name = 'JudgeRolls1764370000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        // [{ "name": "Strength", "value": 2 }], at most 6; checked by the API.
        await queryRunner.query(`ALTER TABLE "role" ADD "stats" jsonb NOT NULL DEFAULT '[]'`);
        // On by default, so every Story, old ones included, may get offers.
        await queryRunner.query(`ALTER TABLE "story" ADD "roll_offers" boolean NOT NULL DEFAULT true`);
        // The Stat a Roll was made for, as the Role named it then, and its number. Both NULL: no Stat.
        await queryRunner.query(`ALTER TABLE "message" ADD "roll_stat" text`);
        await queryRunner.query(`ALTER TABLE "message" ADD "roll_bonus" smallint`);
        // { "stakes": "...", "stat": "Strength" | null, "dismissed": false } on the judged AI Message; NULL: none.
        await queryRunner.query(`ALTER TABLE "message" ADD "roll_offer" jsonb`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "roll_offer"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "roll_bonus"`);
        await queryRunner.query(`ALTER TABLE "message" DROP COLUMN "roll_stat"`);
        await queryRunner.query(`ALTER TABLE "story" DROP COLUMN "roll_offers"`);
        await queryRunner.query(`ALTER TABLE "role" DROP COLUMN "stats"`);
    }
}

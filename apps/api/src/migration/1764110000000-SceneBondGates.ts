import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bond gates (.scratch/bond-axes/spec.md, "Storage"): a Scene's conditions that one Bond has reached
 * at least a level on one Bond axis. `to_character_id` null means toward the user. One gate per
 * Bond and axis on a Scene; the gates go with their Scene and with either Character.
 */
export class SceneBondGates1764110000000 implements MigrationInterface {
    name = 'SceneBondGates1764110000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "scene_bond_gate" (
                "id" SERIAL PRIMARY KEY,
                "scene_id" integer NOT NULL REFERENCES "scene"("id") ON DELETE CASCADE,
                "from_character_id" integer NOT NULL REFERENCES "character"("id") ON DELETE CASCADE,
                "to_character_id" integer REFERENCES "character"("id") ON DELETE CASCADE,
                "axis" text NOT NULL,
                "at_least" smallint NOT NULL,
                CONSTRAINT "uq_scene_bond_gate"
                    UNIQUE NULLS NOT DISTINCT ("scene_id", "from_character_id", "to_character_id", "axis"),
                CONSTRAINT "chk_scene_bond_gate_axis" CHECK ("axis" IN ('trust', 'affection', 'desire', 'tension')),
                CONSTRAINT "chk_scene_bond_gate_not_self"
                    CHECK ("to_character_id" IS NULL OR "to_character_id" <> "from_character_id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "idx_scene_bond_gate_scene" ON "scene_bond_gate" ("scene_id")`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "scene_bond_gate"`);
    }
}

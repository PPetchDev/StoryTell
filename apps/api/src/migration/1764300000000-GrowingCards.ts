import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Growing cards (.scratch/growing-cards/spec.md): a Now note is a detail record of kind `now`, per
 * Character like a Goal, and the user's own edit of one is a detail record tied to no Message.
 *
 * The kind check is rebuilt from the constraint as it stands, plus `now`, so a migration on another
 * branch that adds kinds of its own (story-quality: `fact`, `slip`) is not undone, whichever runs first.
 */
export class GrowingCards1764300000000 implements MigrationInterface {
    name = 'GrowingCards1764300000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        const kinds = await currentKinds(queryRunner);
        await setKinds(queryRunner, [...new Set([...kinds, 'now'])]);
        await queryRunner.query(`ALTER TABLE "detail_change" ALTER COLUMN "message_id" DROP NOT NULL`);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "detail_change" WHERE "kind" = 'now' OR "message_id" IS NULL`);
        await queryRunner.query(`ALTER TABLE "detail_change" ALTER COLUMN "message_id" SET NOT NULL`);
        const kinds = await currentKinds(queryRunner);
        await setKinds(queryRunner, kinds.filter((kind) => kind !== 'now'));
    }
}

/** The kinds the check allows now, read from its definition; the four before this one when there is no check. */
async function currentKinds(queryRunner: QueryRunner): Promise<string[]> {
    const rows: Array<{ definition: string }> = await queryRunner.query(
        `SELECT pg_get_constraintdef(c."oid") AS "definition" FROM pg_constraint c
         JOIN pg_class t ON t."oid" = c."conrelid"
         WHERE t."relname" = 'detail_change' AND c."conname" = 'detail_change_kind_check'`,
    );
    const definition = rows[0]?.definition;
    if (!definition) return ['place', 'weather', 'outfit', 'goal'];
    return [...definition.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

async function setKinds(queryRunner: QueryRunner, kinds: string[]): Promise<void> {
    const list = kinds.map((kind) => `'${kind.replace(/'/g, "''")}'`).join(', ');
    await queryRunner.query(`ALTER TABLE "detail_change" DROP CONSTRAINT IF EXISTS "detail_change_kind_check"`);
    await queryRunner.query(`ALTER TABLE "detail_change" ADD CONSTRAINT "detail_change_kind_check" CHECK ("kind" IN (${list}))`);
}

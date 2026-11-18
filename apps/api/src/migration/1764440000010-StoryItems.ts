import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Items (.scratch/story-items/spec.md): an Item is a detail record of kind `item`, its value JSON.
 *
 * The kind check is rebuilt from the constraint as it stands, plus `item`, as Growing cards did, so a
 * kind another branch adds is not undone, whichever runs first.
 */
export class StoryItems1764440000010 implements MigrationInterface {
    name = 'StoryItems1764440000010';

    async up(queryRunner: QueryRunner): Promise<void> {
        const kinds = await currentKinds(queryRunner);
        await setKinds(queryRunner, [...new Set([...kinds, 'item'])]);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "detail_change" WHERE "kind" = 'item'`);
        const kinds = await currentKinds(queryRunner);
        await setKinds(queryRunner, kinds.filter((kind) => kind !== 'item'));
    }
}

/** The kinds the check allows now, read from its definition; the seven before this one when there is no check. */
async function currentKinds(queryRunner: QueryRunner): Promise<string[]> {
    const rows: Array<{ definition: string }> = await queryRunner.query(
        `SELECT pg_get_constraintdef(c."oid") AS "definition" FROM pg_constraint c
         JOIN pg_class t ON t."oid" = c."conrelid"
         WHERE t."relname" = 'detail_change' AND c."conname" = 'detail_change_kind_check'`,
    );
    const definition = rows[0]?.definition;
    if (!definition) return ['place', 'weather', 'outfit', 'goal', 'fact', 'slip', 'now'];
    return [...definition.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

async function setKinds(queryRunner: QueryRunner, kinds: string[]): Promise<void> {
    const list = kinds.map((kind) => `'${kind.replace(/'/g, "''")}'`).join(', ');
    await queryRunner.query(`ALTER TABLE "detail_change" DROP CONSTRAINT IF EXISTS "detail_change_kind_check"`);
    await queryRunner.query(`ALTER TABLE "detail_change" ADD CONSTRAINT "detail_change_kind_check" CHECK ("kind" IN (${list}))`);
}

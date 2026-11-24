import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pressing notes (.scratch/reply-repair/spec.md): a pressing note is a detail record of kind
 * `pressing`, as `Character: what they pressed for`.
 *
 * The kind check is rebuilt from the constraint as it stands, plus `pressing`, as Items did, so a
 * kind another branch adds is not undone, whichever runs first.
 */
export class PressingNotes1764560000000 implements MigrationInterface {
    name = 'PressingNotes1764560000000';

    async up(queryRunner: QueryRunner): Promise<void> {
        const kinds = await currentKinds(queryRunner);
        await setKinds(queryRunner, [...new Set([...kinds, 'pressing'])]);
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "detail_change" WHERE "kind" = 'pressing'`);
        const kinds = await currentKinds(queryRunner);
        await setKinds(queryRunner, kinds.filter((kind) => kind !== 'pressing'));
    }
}

/** The kinds the check allows now, read from its definition; the eight before this one when there is no check. */
async function currentKinds(queryRunner: QueryRunner): Promise<string[]> {
    const rows: Array<{ definition: string }> = await queryRunner.query(
        `SELECT pg_get_constraintdef(c."oid") AS "definition" FROM pg_constraint c
         JOIN pg_class t ON t."oid" = c."conrelid"
         WHERE t."relname" = 'detail_change' AND c."conname" = 'detail_change_kind_check'`,
    );
    const definition = rows[0]?.definition;
    if (!definition) return ['place', 'weather', 'outfit', 'goal', 'fact', 'slip', 'now', 'item'];
    return [...definition.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

async function setKinds(queryRunner: QueryRunner, kinds: string[]): Promise<void> {
    const list = kinds.map((kind) => `'${kind.replace(/'/g, "''")}'`).join(', ');
    await queryRunner.query(`ALTER TABLE "detail_change" DROP CONSTRAINT IF EXISTS "detail_change_kind_check"`);
    await queryRunner.query(`ALTER TABLE "detail_change" ADD CONSTRAINT "detail_change_kind_check" CHECK ("kind" IN (${list}))`);
}

import pg from 'pg';
import { DataSource } from 'typeorm';

import { MessageEntity } from '../src/model/chat/entities/message.entity.js';
import { ThaiReadingEntity } from '../src/model/chat/entities/thai-reading.entity.js';
import { DocumentPassageEntity } from '../src/model/document/entities/document-passage.entity.js';
import { DocumentEntity } from '../src/model/document/entities/document.entity.js';
import { SavedReplyEntity } from '../src/model/saved-reply/entities/saved-reply.entity.js';
import { ReplaceRuleEntity } from '../src/model/replace-rule/entities/replace-rule.entity.js';
import { UsageRecordEntity } from '../src/model/usage-record/entities/usage-record.entity.js';
import { CharacterExpressionEntity } from '../src/model/story/entities/character-expression.entity.js';
import { BeliefChangeEntity } from '../src/model/ledger/entities/belief-change.entity.js';
import { BeliefEntity } from '../src/model/memory/entities/belief.entity.js';
import { StartingBeliefEntity } from '../src/model/story/entities/starting-belief.entity.js';
import { AccountEntity } from '../src/model/account/entities/account.entity.js';

import { startTestApp, TestApp } from './harness/test-app.js';

// Accounts (.scratch/accounts/spec.md) are the one auth table: sessions are stateless cookies,
// and sign-in itself is Supabase's. This guards against any other creeping in.
describe('Database schema', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    it('has the Account table and no other user, account or session table', async () => {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        const { rows } = await client.query<{ table_name: string }>(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
        );
        await client.end();

        const tables = rows.map((row) => row.table_name);
        expect(tables).toContain('story');
        expect(tables.filter((name) => /user|account|session|login/i.test(name))).toEqual(['app_user']);
    });

    // Older migrations name their constraints their own way, so the whole schema can't be diffed
    // against the entities. Newer tables are checked column by column instead.
    it.each([DocumentEntity, DocumentPassageEntity, ThaiReadingEntity, SavedReplyEntity, ReplaceRuleEntity, UsageRecordEntity, CharacterExpressionEntity, BeliefEntity, BeliefChangeEntity, StartingBeliefEntity, AccountEntity])('migrates every column %o declares, with its type and nullability', async (entity) => {
        const metadata = t.app.get(DataSource).getMetadata(entity);
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        const { rows } = await client.query<{ column_name: string; data_type: string; udt_name: string; is_nullable: 'YES' | 'NO' }>(
            `SELECT column_name, data_type, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
            [metadata.tableName],
        );
        await client.end();

        const migrated = new Map(rows.map((row) => [row.column_name, row]));
        const declared = metadata.columns.filter((column) => !column.isVirtualProperty);
        expect([...migrated.keys()].sort()).toEqual(declared.map((column) => column.databaseName).sort());
        for (const column of declared) {
            const row = migrated.get(column.databaseName)!;
            expect({ column: column.databaseName, nullable: row.is_nullable === 'YES' }).toEqual({
                column: column.databaseName,
                nullable: column.isNullable,
            });
            const type = t.app.get(DataSource).driver.normalizeType(column);
            expect({ column: column.databaseName, type: column.isArray ? row.udt_name : row.data_type }).toEqual({
                column: column.databaseName,
                type: column.isArray ? `_${type === 'real' ? 'float4' : type}` : type,
            });
        }
    });

    it("migrates the Message's record of the Document passages its turn used", async () => {
        const column = t.app
            .get(DataSource)
            .getMetadata(MessageEntity)
            .columns.find((candidate) => candidate.propertyName === 'documentPassages')!;
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        const { rows } = await client.query(
            `SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = 'message' AND column_name = $1`,
            [column.databaseName],
        );
        await client.end();

        expect(rows).toEqual([{ data_type: 'jsonb', is_nullable: 'YES' }]);
        expect({ type: column.type, nullable: column.isNullable }).toEqual({ type: 'jsonb', nullable: true });
    });

    it('removes a Story\'s Documents and their passages with it', async () => {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        const { rows } = await client.query<{ table_name: string; delete_rule: string; references: string }>(`
            SELECT kcu.table_name, rc.delete_rule, ccu.table_name AS references
            FROM information_schema.referential_constraints rc
            JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
            JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.constraint_name
            WHERE kcu.table_name IN ('story_document', 'document_passage')
        `);
        await client.end();

        expect(rows.sort((a, b) => a.table_name.localeCompare(b.table_name))).toEqual([
            { table_name: 'document_passage', delete_rule: 'CASCADE', references: 'story_document' },
            { table_name: 'story_document', delete_rule: 'CASCADE', references: 'story' },
        ]);
    });
});

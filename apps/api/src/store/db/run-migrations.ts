import { createDataSource } from './data-source.js';

/**
 * Applies every pending migration and returns the names of the ones it ran. Refuses a database
 * that isn't UTF-8: on Windows, a cluster or database made with the machine's locale is WIN1252,
 * which refuses Thai and other text outside its code page (seen 2026-11-05).
 */
export async function runMigrations(databaseUrl: string): Promise<string[]> {
    const dataSource = createDataSource(databaseUrl);
    await dataSource.initialize();
    try {
        const [{ server_encoding: encoding }] = (await dataSource.query('SHOW server_encoding')) as Array<{ server_encoding: string }>;
        if (encoding !== 'UTF8') {
            throw new Error(
                `The database is ${encoding}, not UTF8, so text outside that code page (Thai, emoji) can't be saved. ` +
                    `Create it with ENCODING 'UTF8' TEMPLATE template0 (see README, "One-time setup") and copy the data over.`,
            );
        }
        const applied = await dataSource.runMigrations({ transaction: 'each' });
        return applied.map((migration) => migration.name);
    } finally {
        await dataSource.destroy();
    }
}

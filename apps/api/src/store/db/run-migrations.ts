import { createDataSource } from './data-source.js';

/** Applies every pending migration and returns the names of the ones it ran. */
export async function runMigrations(databaseUrl: string): Promise<string[]> {
    const dataSource = createDataSource(databaseUrl);
    await dataSource.initialize();
    try {
        const applied = await dataSource.runMigrations({ transaction: 'each' });
        return applied.map((migration) => migration.name);
    } finally {
        await dataSource.destroy();
    }
}

import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

// Plain TypeScript with no decorators or path aliases: the Playwright harness in apps/web
// imports this file too.

const USER = 'postgres';
const PASSWORD = 'postgres';

export interface DisposablePostgres {
    /** Connection URL for a database on this server. */
    url(database: string): string;
    createDatabase(name: string, options?: { template?: string }): Promise<void>;
    dropDatabase(name: string): Promise<void>;
    /** Stops the server and deletes its data directory. */
    stop(): Promise<void>;
}

export async function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address() as net.AddressInfo;
            server.close(() => resolve(port));
        });
    });
}

/** A real PostgreSQL server in a temporary folder, on a free port, gone after stop(). */
export async function startDisposablePostgres(): Promise<DisposablePostgres> {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'storytell-pg-'));
    const port = await freePort();
    const server = new EmbeddedPostgres({
        databaseDir: dataDir,
        port,
        user: USER,
        password: PASSWORD,
        persistent: false,
        // PostgreSQL 18's io_worker processes can outlive stop() on Windows; sync I/O has none.
        postgresFlags: ['-c', 'io_method=sync'],
        onLog: () => {},
    });
    await server.initialise();
    await server.start();

    const url = (database: string) =>
        `postgres://${USER}:${PASSWORD}@127.0.0.1:${port}/${database}`;

    const admin = async (sql: string) => {
        const client = new pg.Client({ connectionString: url('postgres') });
        await client.connect();
        try {
            await client.query(sql);
        } finally {
            await client.end();
        }
    };

    return {
        url,
        createDatabase: (name, options) =>
            admin(
                `CREATE DATABASE "${name}"${options?.template ? ` TEMPLATE "${options.template}"` : ''}`,
            ),
        dropDatabase: (name) => admin(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
        stop: async () => {
            await server.stop();
            await rm(dataDir, { recursive: true, force: true });
        },
    };
}

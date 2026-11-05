// `npm run dev`: starts the dev database, migrates it, then runs the API and the frontend in
// watch mode. Dev keeps its own database, port and image folder under .data/dev, apart from
// live. Ctrl+C stops everything.
import { execFileSync, execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Optional overrides and provider keys. Real environment variables win over the file.
if (existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));

const webPort = Number(process.env.DEV_WEB_PORT ?? 3001);
const apiPort = Number(process.env.DEV_API_PORT ?? 4001);
const pgPort = Number(process.env.DEV_PG_PORT ?? 54321);
const dataDir = path.join(root, '.data', 'dev');
const pgDir = path.join(dataDir, 'postgres');
const imageDir = path.join(dataDir, 'images');
const database = 'storytell_dev';

mkdirSync(imageDir, { recursive: true });

const postgres = new EmbeddedPostgres({
    databaseDir: pgDir,
    port: pgPort,
    user: 'postgres',
    password: 'postgres',
    persistent: true,
    // UTF-8 whatever the machine's locale: on Windows initdb otherwise picks WIN1252, which refuses Thai.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    // PostgreSQL 18's io_worker processes can outlive a stop on Windows; sync I/O has none.
    postgresFlags: ['-c', 'io_method=sync'],
    onLog: () => {},
});
if (!existsSync(path.join(pgDir, 'PG_VERSION'))) {
    console.log(`Creating the dev database cluster in ${pgDir} ...`);
    await postgres.initialise();
} else if (existsSync(path.join(pgDir, 'postmaster.pid'))) {
    // A previous run was killed before it could stop the server. Stop it cleanly first.
    const platform = process.platform === 'win32' ? 'windows' : process.platform;
    const { pg_ctl } = await import(`@embedded-postgres/${platform}-${process.arch}`);
    try {
        execFileSync(pg_ctl, ['stop', '-D', pgDir, '-m', 'fast'], { stdio: 'ignore' });
        console.log('Stopped a dev PostgreSQL left running by an earlier run.');
    } catch {
        // Not running after all; the pid file is stale and PostgreSQL ignores it.
    }
}
await postgres.start();
await postgres.createDatabase(database).catch((error) => {
    if (!/already exists/.test(String(error?.message))) throw error;
});
console.log(`PostgreSQL (dev) on port ${pgPort}`);

const apiEnv = {
    ...process.env,
    PORT: String(apiPort),
    DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${pgPort}/${database}`,
    IMAGE_DIR: imageDir,
};

const children = [];

async function shutdown(code = 0) {
    for (const child of children) {
        if (child.exitCode !== null) continue;
        // npm and nest each spawn their own children; on Windows only taskkill /T reaches them.
        if (process.platform === 'win32') {
            try {
                execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
            } catch {
                // Already gone.
            }
        } else {
            child.kill('SIGINT');
        }
    }
    await postgres.stop();
    process.exit(code);
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

try {
    execSync('npm run build -w apps/api', { cwd: root, stdio: 'inherit', env: apiEnv });
    execSync('npm run migrate -w apps/api', { cwd: root, stdio: 'inherit', env: apiEnv });
} catch {
    await shutdown(1);
}

function run(name, command, env) {
    const child = spawn(command, { cwd: root, env, stdio: 'inherit', shell: true });
    child.on('exit', (code) => {
        if (code !== null && code !== 0) {
            console.error(`${name} exited with code ${code}`);
            void shutdown(code);
        }
    });
    children.push(child);
}

run('API', 'npm run start:dev -w apps/api', apiEnv);
run('Web', `npm run dev -w apps/web -- --port ${webPort}`, {
    ...process.env,
    API_ORIGIN: `http://127.0.0.1:${apiPort}`,
    INSTANCE_LABEL: 'dev',
});

console.log(`\nStorytell AI (dev): http://localhost:${webPort}\n`);

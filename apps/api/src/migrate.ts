import { loadConfig, loadEnvFile } from './config/app-config.js';
import { runMigrations } from './store/db/run-migrations.js';

// Entry point for `npm run migrate`. Live runs this only as part of its deploy step.
loadEnvFile();
const config = loadConfig();
const applied = await runMigrations(config.databaseUrl);
console.log(
    applied.length > 0 ? `Applied migrations: ${applied.join(', ')}` : 'No pending migrations.',
);

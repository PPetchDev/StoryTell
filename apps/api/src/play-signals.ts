import { loadConfig, loadEnvFile } from './config/app-config.js';
import { FEWEST_FOR_A_RATE, formatPlaySignals, playSignals } from './manager/play-signals/play-signals.js';
import { createDataSource } from './store/db/data-source.js';

// Entry point for `npm run signals`: the play-signals report (README, "What the Regenerates say").
// It reads the database the settings name and prints counts and rates; it changes nothing.
//
//   node dist/play-signals.js                 (every account together)
//   node dist/play-signals.js --user 3        (one account)
//   node dist/play-signals.js --min 5         (give a rate from five replies up, not twenty)
const args = process.argv.slice(2);
const valueOf = (flag: string): number | undefined => {
    const at = args.indexOf(flag);
    if (at === -1) return undefined;
    const value = Number(args[at + 1]);
    if (!Number.isInteger(value) || value < 1) {
        console.error(`${flag} takes a whole number.`);
        process.exit(1);
    }
    return value;
};
const userId = valueOf('--user');
const minimum = valueOf('--min') ?? FEWEST_FOR_A_RATE;

loadEnvFile();
const dataSource = createDataSource(loadConfig().databaseUrl);
await dataSource.initialize();
const runner = dataSource.createQueryRunner();
try {
    // Read-only, so nothing here can write even by mistake; one connection, so the statements see one state.
    await runner.query('BEGIN TRANSACTION READ ONLY');
    const groups = await playSignals((sql, params) => runner.query(sql, params), { userId });
    console.log(formatPlaySignals(groups, { minimum }));
} finally {
    await runner.query('ROLLBACK').catch(() => undefined);
    await runner.release();
    await dataSource.destroy();
}

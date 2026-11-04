// The daily backup (ticket 33). Each deploy copies this file to <LIVE_HOME>/backup.mjs; the live
// supervisor runs it when it starts and every hour after, and `npm run live:backup` runs it by
// hand with --force. It makes at most one backup a day (a last-run stamp), so the hourly runs
// only matter on a day the first one couldn't dump the database.
//
// A backup is a folder storytell-YYYYMMDD-HHMMSS holding storytell.dump (pg_dump, custom format),
// images/ (the whole image folder, relative paths intact) and manifest.json. It goes to each
// configured target: a folder on the second disk (BACKUP_DISK_DIR) and an rclone remote
// (BACKUP_REMOTE), meant to be a crypt remote over Google Drive so only ciphertext leaves the PC.
// Each target keeps the newest BACKUP_KEEP backups. A failed target never stops the other one;
// the outcome goes to <LIVE_HOME>/backup/status.json, which the app shows as a banner.
import { execFileSync } from 'node:child_process';
import {
    appendFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const NAME = /^storytell-\d{8}-\d{6}$/;
const args = process.argv.slice(2);
const force = args.includes('--force');
const homeArg = args.indexOf('--home');
const home = path.resolve(homeArg >= 0 ? args[homeArg + 1] : path.dirname(fileURLToPath(import.meta.url)));

const backupDir = path.join(home, 'backup');
const logFile = path.join(home, 'logs', 'backup.log');
mkdirSync(backupDir, { recursive: true });
mkdirSync(path.dirname(logFile), { recursive: true });

function log(line) {
    appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`);
    console.log(line);
}

const envFile = path.join(home, 'live.env');
if (!existsSync(envFile)) {
    log(`no ${envFile}; nothing to back up`);
    process.exit(1);
}
const env = parseEnv(readFileSync(envFile, 'utf8'));
const imageDir = path.resolve(env.LIVE_IMAGE_DIR ?? path.join(home, 'images'));
const keep = Math.max(1, Number(env.BACKUP_KEEP ?? 14) || 14);
const diskDir = env.BACKUP_DISK_DIR ? path.resolve(env.BACKUP_DISK_DIR) : undefined;
const remote = env.BACKUP_REMOTE?.trim() || undefined;
const rclone = env.RCLONE || 'rclone';

if (!env.DATABASE_URL) {
    log(`DATABASE_URL is not set in ${envFile}`);
    process.exit(1);
}
if (!diskDir && !remote) {
    log('no backup targets: set BACKUP_DISK_DIR and/or BACKUP_REMOTE in .env.live');
    process.exit(0);
}

const localDate = (date) =>
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
const stampFile = path.join(backupDir, 'last-run');
const now = new Date();
if (!force && existsSync(stampFile) && readFileSync(stampFile, 'utf8').trim() === localDate(now)) {
    process.exit(0);
}

// One backup at a time: the hourly run and a manual one could meet. A lock older than three
// hours belongs to a run that was killed.
const lockFile = path.join(backupDir, 'lock');
try {
    writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
} catch {
    if (Date.now() - statSync(lockFile).mtimeMs < 3 * 3600_000) {
        log('another backup is running; skipping');
        process.exit(0);
    }
    writeFileSync(lockFile, String(process.pid));
}

try {
    process.exitCode = await backUp();
} finally {
    rmSync(lockFile, { force: true });
}

function findPgBin() {
    if (env.PG_BIN) return path.resolve(env.PG_BIN);
    // The EDB installer's default place; the newest major wins.
    const base = 'C:\\Program Files\\PostgreSQL';
    if (existsSync(base)) {
        const majors = readdirSync(base).filter((name) => /^\d+$/.test(name)).sort((a, b) => Number(b) - Number(a));
        for (const major of majors) {
            const bin = path.join(base, major, 'bin');
            if (existsSync(path.join(bin, 'pg_dump.exe'))) return bin;
        }
    }
    return undefined;
}

function message(error) {
    const stderr = error?.stderr?.toString().trim();
    return (stderr || error?.message || String(error)).split('\n').slice(-3).join(' ').slice(0, 500);
}

function folderStats(dir) {
    let files = 0;
    let bytes = 0;
    if (!existsSync(dir)) return { files, bytes };
    for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!entry.isFile()) continue;
        files += 1;
        bytes += statSync(path.join(entry.parentPath, entry.name)).size;
    }
    return { files, bytes };
}

async function backUp() {
    const name = `storytell-${localDate(now)}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const staging = path.join(backupDir, 'staging', name);
    const status = { attemptedAt: now.toISOString(), backup: name, targets: {} };
    const targets = [diskDir && 'disk', remote && 'drive'].filter(Boolean);
    const writeStatus = () => writeFileSync(path.join(backupDir, 'status.json'), JSON.stringify(status, null, 2));
    log(`backup ${name} starting (targets: ${targets.join(', ')})`);

    // 1. Dump the database and copy the image folder into a staging folder.
    try {
        rmSync(path.join(backupDir, 'staging'), { recursive: true, force: true });
        mkdirSync(staging, { recursive: true });
        const pgBin = findPgBin();
        const pgDump = pgBin ? path.join(pgBin, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump') : 'pg_dump';
        // The password goes in the environment, not the command line other processes can read.
        const url = new URL(env.DATABASE_URL);
        const password = decodeURIComponent(url.password);
        url.password = '';
        execFileSync(pgDump, ['--format=custom', '--no-owner', '--file', path.join(staging, 'storytell.dump'), '--dbname', url.toString()], {
            stdio: ['ignore', 'ignore', 'pipe'],
            env: { ...process.env, PGPASSWORD: password },
        });
        if (existsSync(imageDir)) cpSync(imageDir, path.join(staging, 'images'), { recursive: true });
        else mkdirSync(path.join(staging, 'images'));
        writeFileSync(
            path.join(staging, 'manifest.json'),
            JSON.stringify(
                {
                    backup: name,
                    createdAt: now.toISOString(),
                    database: url.toString(),
                    release: existsSync(path.join(home, 'current')) ? readFileSync(path.join(home, 'current'), 'utf8').trim() : null,
                    pgDump: execFileSync(pgDump, ['--version'], { encoding: 'utf8' }).trim(),
                    dumpBytes: statSync(path.join(staging, 'storytell.dump')).size,
                    images: folderStats(path.join(staging, 'images')),
                },
                null,
                2,
            ),
        );
    } catch (error) {
        const reason = `couldn't make the backup: ${message(error)}`;
        for (const target of targets) status.targets[target] = { ok: false, at: new Date().toISOString(), error: reason };
        writeStatus();
        log(reason);
        rmSync(path.join(backupDir, 'staging'), { recursive: true, force: true });
        // No stamp: the next hourly run tries again today.
        return 1;
    }

    // 2. Each target on its own, so one failing never stops the other.
    if (diskDir) {
        try {
            mkdirSync(diskDir, { recursive: true });
            const partial = path.join(diskDir, `${name}.partial`);
            rmSync(partial, { recursive: true, force: true });
            cpSync(staging, partial, { recursive: true });
            renameSync(partial, path.join(diskDir, name));
            const backups = readdirSync(diskDir).filter((entry) => NAME.test(entry)).sort().reverse();
            for (const old of backups.slice(keep)) rmSync(path.join(diskDir, old), { recursive: true, force: true });
            status.targets.disk = { ok: true, at: new Date().toISOString(), error: null };
            log(`disk: saved to ${path.join(diskDir, name)}; keeping ${Math.min(backups.length, keep)}`);
        } catch (error) {
            status.targets.disk = { ok: false, at: new Date().toISOString(), error: message(error) };
            log(`disk: failed: ${message(error)}`);
        }
    }
    if (remote) {
        const at = (folder) => `${remote}${remote.endsWith(':') || remote.endsWith('/') ? '' : '/'}${folder}`;
        // rclone finds its config (with the crypt passwords) in the user's profile by default;
        // RCLONE_* settings in .env.live, such as RCLONE_CONFIG, override that.
        const rcEnv = { ...process.env, ...Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('RCLONE_'))) };
        const rc = (...rcArgs) => execFileSync(rclone, rcArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: rcEnv });
        try {
            rc('purge', at(`${name}.partial`));
        } catch {
            // Nothing left over from an earlier run.
        }
        try {
            rc('copy', staging, at(`${name}.partial`));
            rc('moveto', at(`${name}.partial`), at(name));
            const backups = rc('lsf', '--dirs-only', remote)
                .split(/\r?\n/)
                .map((entry) => entry.replace(/\/$/, ''))
                .filter((entry) => NAME.test(entry))
                .sort()
                .reverse();
            for (const old of backups.slice(keep)) rc('purge', at(old));
            status.targets.drive = { ok: true, at: new Date().toISOString(), error: null };
            log(`drive: saved to ${at(name)}; keeping ${Math.min(backups.length, keep)}`);
        } catch (error) {
            status.targets.drive = { ok: false, at: new Date().toISOString(), error: message(error) };
            log(`drive: failed: ${message(error)}`);
        }
    }

    // A backup was made today, even if a target failed: the banner says so, and tomorrow's run
    // tries every target again.
    writeFileSync(stampFile, localDate(now));
    writeStatus();
    rmSync(path.join(backupDir, 'staging'), { recursive: true, force: true });
    const failed = Object.values(status.targets).some((target) => !target.ok);
    log(`backup ${name} ${failed ? 'finished with a failed target' : 'done'}`);
    return failed ? 1 : 0;
}

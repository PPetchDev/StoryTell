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
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    utimesSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const NAME = /^storytell-\d{8}-\d{6}$/;
const PARTIAL = /^storytell-\d{8}-\d{6}\.partial$/;
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
const keep = env.BACKUP_KEEP === undefined ? 14 : Number(env.BACKUP_KEEP);
const diskDir = env.BACKUP_DISK_DIR ? path.resolve(env.BACKUP_DISK_DIR) : undefined;
const remote = env.BACKUP_REMOTE?.trim() || undefined;
const rclone = env.RCLONE || 'rclone';

/** Is `child` the folder `parent` or inside it? Case-insensitive on Windows, like the file system. */
function inside(child, parent) {
    const rel = path.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Settings that would make a backup wrong or destructive stop the run, and the banner says why.
const problems = [];
if (!env.DATABASE_URL) problems.push(`DATABASE_URL is not set in ${envFile}`);
if (!Number.isInteger(keep) || keep < 1) problems.push(`BACKUP_KEEP must be a whole number of at least 1, got "${env.BACKUP_KEEP}"`);
// A disk folder inside the images would back itself up; one inside LIVE_HOME could be swept away.
if (diskDir && (inside(diskDir, imageDir) || inside(diskDir, home))) {
    problems.push(`BACKUP_DISK_DIR (${diskDir}) must be outside LIVE_HOME and the image folder`);
}
// Without a colon rclone reads the remote as a local folder; the banner would say "saved" wrongly.
if (remote && !remote.includes(':')) problems.push(`BACKUP_REMOTE must be an rclone remote such as "storytell-backup:", got "${remote}"`);
if (!diskDir && !remote) {
    log('no backup targets: set BACKUP_DISK_DIR and/or BACKUP_REMOTE in .env.live');
    process.exit(0);
}
if (problems.length > 0) {
    const at = new Date().toISOString();
    const error = `backup settings: ${problems.join('; ')}`;
    const targets = Object.fromEntries([diskDir && 'disk', remote && 'drive'].filter(Boolean).map((target) => [target, { ok: false, at, error }]));
    writeFileSync(path.join(backupDir, 'status.json'), JSON.stringify({ attemptedAt: at, backup: null, targets }, null, 2));
    log(error);
    process.exit(1);
}

const localDate = (date) =>
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
const stampFile = path.join(backupDir, 'last-run');
const now = new Date();
if (!force && existsSync(stampFile) && readFileSync(stampFile, 'utf8').trim() === localDate(now)) {
    process.exit(0);
}

// One backup at a time: the hourly run and a manual one could meet. A running backup touches its
// lock every minute, so a lock untouched for 15 minutes belongs to a run that was killed.
const lockFile = path.join(backupDir, 'lock');
const lockAge = () => {
    try {
        return Date.now() - statSync(lockFile).mtimeMs;
    } catch {
        return Infinity;
    }
};
try {
    writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
} catch {
    if (lockAge() < 15 * 60_000) {
        log('another backup is running; skipping');
        // 2, not 0, so `npm run live:backup` can say no backup was made.
        process.exit(2);
    }
    writeFileSync(lockFile, String(process.pid));
}
const keepLock = setInterval(() => {
    try {
        utimesSync(lockFile, new Date(), new Date());
    } catch {
        // Gone: the next write below recreates it.
    }
}, 60_000);

try {
    process.exitCode = await backUp();
} finally {
    clearInterval(keepLock);
    // Only our own lock: a run that took over a stale one owns it now.
    try {
        if (readFileSync(lockFile, 'utf8').trim() === String(process.pid)) rmSync(lockFile, { force: true });
    } catch {
        // Already gone.
    }
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
    return (stderr || error?.message || String(error))
        .split('\n')
        .slice(-3)
        // rclone prefixes its lines with a timestamp and a level; the banner only needs the reason.
        .map((line) => line.replace(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2} [A-Z]+\s*:\s*/, '').trim())
        .join(' ')
        .slice(0, 500);
}

/** Antivirus and the search indexer briefly hold fresh files, so a folder rename can fail with EPERM. */
async function renameWithRetries(from, to) {
    for (let attempt = 1; ; attempt++) {
        try {
            renameSync(from, to);
            return;
        } catch (error) {
            if (attempt >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
        }
    }
}

/**
 * Copies the image folder into `to`, overwriting what is there. A file or folder the app deletes
 * mid-copy is skipped rather than failing the whole backup, as `cpSync` would.
 */
function copyImages(from, to) {
    mkdirSync(to, { recursive: true });
    let entries;
    try {
        entries = readdirSync(from, { withFileTypes: true });
    } catch (error) {
        if (error.code === 'ENOENT') return;
        throw error;
    }
    for (const entry of entries) {
        const source = path.join(from, entry.name);
        const target = path.join(to, entry.name);
        if (entry.isDirectory()) {
            copyImages(source, target);
            continue;
        }
        if (!entry.isFile()) continue;
        try {
            copyFileSync(source, target);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }
    }
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

    // 1. Copy the image folder, dump the database, then add any images made meanwhile, into a staging folder.
    try {
        rmSync(path.join(backupDir, 'staging'), { recursive: true, force: true });
        mkdirSync(staging, { recursive: true });
        const pgBin = findPgBin();
        const pgDump = pgBin ? path.join(pgBin, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump') : 'pg_dump';
        // The password goes in the environment, not the command line other processes can read.
        const url = new URL(env.DATABASE_URL);
        const password = decodeURIComponent(url.password) || url.searchParams.get('password') || '';
        url.password = '';
        url.searchParams.delete('password');
        // Images are copied on both sides of the dump, so every image the dump names is whole in the
        // backup. The app writes an image's file before its row, so the second copy, which
        // overwrites, has every file the dump names in full, including one caught mid-write by the
        // first. A file deleted while the dump ran is still there from the first copy, since
        // copying never removes. Either order alone loses one of those.
        const stagedImages = path.join(staging, 'images');
        copyImages(imageDir, stagedImages);
        execFileSync(pgDump, ['--format=custom', '--no-owner', '--file', path.join(staging, 'storytell.dump'), '--dbname', url.toString()], {
            stdio: ['ignore', 'ignore', 'pipe'],
            env: { ...process.env, PGPASSWORD: password },
        });
        copyImages(imageDir, stagedImages);
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
            // Copies a stopped or failed run left half-done. We hold the lock, so none is in use.
            for (const entry of readdirSync(diskDir).filter((entry) => PARTIAL.test(entry))) {
                rmSync(path.join(diskDir, entry), { recursive: true, force: true });
            }
            const partial = path.join(diskDir, `${name}.partial`);
            cpSync(staging, partial, { recursive: true });
            await renameWithRetries(partial, path.join(diskDir, name));
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
        // Pruned backups skip Drive's trash, which would otherwise keep counting against the quota.
        const purge = (folder) => rc('purge', '--drive-use-trash=false', at(folder));
        try {
            // Only ciphertext may leave the PC: the remote must be a crypt remote.
            const remoteName = remote.slice(0, remote.indexOf(':'));
            const type = rc('listremotes', '--long')
                .split(/\r?\n/)
                .map((line) => line.match(/^(.+?):\s+(\S+)/))
                .find((match) => match?.[1] === remoteName)?.[2];
            if (type !== 'crypt') {
                throw new Error(`BACKUP_REMOTE "${remoteName}:" is ${type ? `a ${type} remote` : 'not in the rclone config'}; it must be a crypt remote, so only encrypted files leave the PC`);
            }
            const listed = () =>
                rc('lsf', '--dirs-only', remote)
                    .split(/\r?\n/)
                    .map((entry) => entry.replace(/\/$/, ''));
            for (const leftover of listed().filter((entry) => PARTIAL.test(entry))) purge(leftover);
            rc('copy', staging, at(`${name}.partial`));
            rc('moveto', at(`${name}.partial`), at(name));
            const backups = listed()
                .filter((entry) => NAME.test(entry))
                .sort()
                .reverse();
            for (const old of backups.slice(keep)) purge(old);
            status.targets.drive = { ok: true, at: new Date().toISOString(), error: null };
            log(`drive: saved to ${at(name)}; keeping ${Math.min(backups.length, keep)}`);
        } catch (error) {
            status.targets.drive = { ok: false, at: new Date().toISOString(), error: message(error) };
            log(`drive: failed: ${message(error)}`);
        }
    }

    // A backup that reached at least one target counts for today: the banner shows a failed one,
    // and tomorrow's run tries every target again. If none got it, the next hourly run retries.
    if (Object.values(status.targets).some((target) => target.ok)) writeFileSync(stampFile, localDate(now));
    writeStatus();
    rmSync(path.join(backupDir, 'staging'), { recursive: true, force: true });
    const failed = Object.values(status.targets).some((target) => !target.ok);
    log(`backup ${name} ${failed ? 'finished with a failed target' : 'done'}`);
    return failed ? 1 : 0;
}

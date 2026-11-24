// Deploys a commit to the Oracle VM (README, "Live on the Oracle VM"): `npm run vm:deploy`.
//
//   npm run vm:deploy                      (the checked-out commit)
//   npm run vm:deploy -- <ref>
//   npm run vm:deploy -- --unmeasured      (a prompt change no prompt eval run measured: go ahead anyway)
//
// It archives the commit, uploads it with that commit's scripts/vm/deploy.sh, runs the script on
// the VM, and says which commit live runs and what health answers. What happens on the VM is
// deploy.sh's.
//
// Before it uploads, it lists the files changed since the commit live runs. If one is a prompt
// builder and no prompt eval run measured this exact commit (.scratch/prompt-evals/spec.md), it
// stops and says so. It never starts an eval run (that spends credit, and is the user's to start)
// and never asks a question: it is often run by an agent. --unmeasured is the deliberate way past.
//
// Settings come from .env.vm (git-ignored; see .env.example): where the VM is, the key, and the
// public health address.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

/**
 * The files whose change a prompt eval run should measure before it goes live: the prompts the
 * eval scenes play (the turn, the Judge, Memory extraction), and the two others every turn leans
 * on. A new prompt builder the eval can measure belongs in this list; a test checks each is there.
 */
export const PROMPT_BUILDERS = [
    'apps/api/src/manager/chat/turn/prompt.ts',
    'apps/api/src/manager/chat/judge/judge-prompt.ts',
    'apps/api/src/manager/chat/memory/memory-prompt.ts',
    'apps/api/src/manager/chat/story-so-far/story-so-far-prompt.ts',
    'apps/api/src/manager/chat/speech/speech-repair.ts',
];

/** Where the VM keeps the commit of the release it runs (scripts/vm/deploy.sh writes it). */
const LIVE_COMMIT = 'sudo cat /srv/storytell/app/COMMIT';
/** ssh's own exit code for a connection it lost, as apart from the code of the command it ran. */
const CONNECTION_LOST = 255;
/** deploy.sh waits a few seconds after starting the app; a slow start gets this many more looks at health, a few seconds apart. */
const HEALTH_TRIES = 6;
const HEALTH_PAUSE_MS = 5_000;

/** A deploy that stopped for a reason to tell in one plain line: refused before it began, or ended badly. */
export class DeployStopped extends Error {}

/** One commit under two names: live may have been given the whole hash by hand, git gives a short one. */
const sameCommit = (a, b) => a !== '' && b !== '' && (a.startsWith(b) || b.startsWith(a));

/**
 * The deploy, with everything it touches handed in as `world` (scripts/vm-deploy.d.mts), so the
 * tests drive it with a scripted git and a scripted VM.
 */
export async function deployToVm(options, world) {
    const ref = options.ref ?? 'HEAD';
    if (ref.startsWith('-')) throw new DeployStopped(`"${ref}" is not a ref.`);
    // As a commit: a tag's own hash is not the commit it names.
    const commit = world.git(['rev-parse', '--verify', '--short', `${ref}^{commit}`]).trim();
    if (world.git(['status', '--porcelain', '--untracked-files=no']).trim() !== '') {
        throw new DeployStopped('The working tree has uncommitted changes to tracked files: commit them first. Only a commit is deployed.');
    }
    // What the remote has now, not what this checkout last heard.
    world.git(['fetch', '--quiet']);
    if (world.git(['branch', '-r', '--contains', commit]).trim() === '') {
        throw new DeployStopped(`The remote does not have ${commit}: push it first.`);
    }
    const live = world.remote.read(LIVE_COMMIT).trim();
    if (sameCommit(live, commit)) {
        world.log(`Live already runs ${commit}.`);
        return;
    }

    const prompts = promptsChanged(live, commit, world);
    if (prompts === null) {
        if (!options.unmeasured) {
            throw new DeployStopped(
                `Git here does not know ${live}, the commit live runs, so what changed cannot be listed. Fetch it, or deploy anyway with --unmeasured.`,
            );
        }
        world.log(`Going ahead unmeasured: what changed since ${live} cannot be listed.`);
    } else if (prompts.length > 0) {
        // A run of this very commit, with nothing uncommitted on top: a run of a dirty tree measured something else.
        const measured = world.evalReports().some((report) => !report.dirty && sameCommit(report.commit, commit));
        if (!measured && !options.unmeasured) {
            throw new DeployStopped(
                `No prompt eval run measured ${commit}, and it changes a prompt: ${prompts.join(', ')}. ` +
                    'Run the eval on this commit with a clean tree (npm run eval:live -w apps/api -- all --spend --samples 3; it spends credit, so only on the user’s word), ' +
                    'or deploy anyway with --unmeasured.',
            );
        }
        if (!measured) world.log(`Going ahead unmeasured: ${prompts.join(', ')}.`);
    }

    world.log(`Deploying ${commit} (live runs ${live}).`);
    world.archive(commit);
    // The commit's own deploy script: a ref other than the one checked out brings its own.
    world.stage('deploy.sh', world.git(['show', `${commit}:scripts/vm/deploy.sh`]));
    world.remote.upload(['release.tar.gz', 'deploy.sh']);
    const exit = world.remote.run(`bash /tmp/deploy.sh ${commit}`);
    if (exit === CONNECTION_LOST) {
        // deploy.sh runs detached for this very case; running it again would pull the release out from under it.
        throw new DeployStopped(
            'The connection to the VM dropped. The deploy carries on there by itself: `tail -f /tmp/st-deploy.log` on the VM shows the rest. ' +
                'Run this command again only to check (it says "Live already runs" once done); do not deploy again until it has ended.',
        );
    }
    const now = world.remote.read(LIVE_COMMIT).trim();
    if (exit !== 0) throw new DeployStopped(`The deploy script failed (exit ${exit}). Live runs ${now}. See /tmp/st-deploy.log on the VM.`);
    if (!sameCommit(now, commit)) throw new DeployStopped(`The deploy script ended, but live runs ${now}, not ${commit}.`);
    let health = await world.health();
    for (let tries = 1; health !== 200 && tries < HEALTH_TRIES; tries++) {
        await world.pause(HEALTH_PAUSE_MS);
        health = await world.health();
    }
    if (health !== 200) throw new DeployStopped(`Live runs ${now}, but health answers ${health}.`);
    world.log(`Live runs ${now}; health answers ${health}.`);
}

/**
 * The prompt builders changed between what live runs and the commit; null when git here does not
 * know the commit live runs. Renames are listed as a file gone and a file new, so a prompt builder
 * moved and changed still shows under its listed name.
 */
function promptsChanged(live, commit, world) {
    let changed;
    try {
        changed = world.git(['diff', '--name-only', '--no-renames', live, commit]);
    } catch {
        return null;
    }
    const files = changed.split('\n').map((file) => file.trim());
    return PROMPT_BUILDERS.filter((file) => files.includes(file));
}

/** OpenSSH as Windows ships it, when there: the scp that Git Bash puts first on PATH reads `C:\…` as a host named C. */
function openSsh(tool) {
    const shipped = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'OpenSSH', `${tool}.exe`) : '';
    return shipped && existsSync(shipped) ? shipped : tool;
}

/** The real world: this checkout's git, the VM over ssh, the eval reports under .data. */
function realWorld(root, settings) {
    const key = ['-i', settings.VM_SSH_KEY, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20'];
    const kept = [...key, '-o', 'ServerAliveInterval=30'];
    // What is uploaded is put together outside the checkout, so a deploy never leaves a file in the working tree.
    let staging = null;
    const staged = (name) => path.join((staging ??= mkdtempSync(path.join(tmpdir(), 'storytell-deploy-'))), name);
    return {
        git: (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
        archive: (commit) => void execFileSync('git', ['archive', '--format=tar.gz', '-o', staged('release.tar.gz'), commit], { cwd: root }),
        stage: (name, text) => writeFileSync(staged(name), text),
        remote: {
            read: (command) => execFileSync(openSsh('ssh'), [...kept, settings.VM_SSH, command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
            upload: (names) => void execFileSync(openSsh('scp'), [...key, ...names.map(staged), `${settings.VM_SSH}:/tmp/`], { stdio: 'inherit' }),
            run: (command) => spawnSync(openSsh('ssh'), [...kept, settings.VM_SSH, command], { stdio: 'inherit' }).status ?? CONNECTION_LOST,
        },
        evalReports: () => {
            const dir = path.join(root, '.data', 'eval-runs');
            if (!existsSync(dir)) return [];
            return readdirSync(dir)
                .filter((file) => file.startsWith('eval-') && file.endsWith('.json'))
                .flatMap((file) => {
                    try {
                        const report = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
                        return [{ commit: String(report.commit ?? ''), dirty: report.dirty !== false }];
                    } catch {
                        // A report that cannot be read measured nothing.
                        return [];
                    }
                });
        },
        health: async () => {
            try {
                return (await fetch(settings.VM_HEALTH_URL, { signal: AbortSignal.timeout(10_000) })).status;
            } catch {
                return 0;
            }
        },
        pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        log: (line) => console.log(line),
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const envFile = path.join(root, '.env.vm');
    const fail = (line) => {
        console.error(line);
        process.exit(1);
    };
    if (!existsSync(envFile)) fail(`No ${envFile}. Copy the VM block of .env.example into .env.vm and fill it in (README: "Live on the Oracle VM").`);
    const settings = parseEnv(readFileSync(envFile, 'utf8'));
    for (const name of ['VM_SSH', 'VM_SSH_KEY', 'VM_HEALTH_URL']) {
        if (!settings[name]) fail(`${name} is not set in ${envFile}.`);
    }
    settings.VM_SSH_KEY = settings.VM_SSH_KEY.replace(/^~(?=[/\\])/, process.env.USERPROFILE ?? process.env.HOME ?? '~');
    const args = process.argv.slice(2);
    const unknown = args.find((arg) => arg.startsWith('--') && arg !== '--unmeasured');
    if (unknown) fail(`Unknown flag ${unknown}. The one flag is --unmeasured.`);
    try {
        await deployToVm({ ref: args.find((arg) => !arg.startsWith('--')), unmeasured: args.includes('--unmeasured') }, realWorld(root, settings));
    } catch (error) {
        // One plain line, whatever stopped it: git or ssh failing says so in its own words.
        fail(error instanceof DeployStopped ? error.message : `The deploy stopped: ${String(error?.stderr || error?.message || error).trim()}`);
    }
}

import { existsSync } from 'node:fs';
import path from 'node:path';

import { deployToVm, PROMPT_BUILDERS, VmWorld } from '../../../scripts/vm-deploy.mjs';

/**
 * The deploy command (.scratch/reply-repair/spec.md, ticket 02): one command on the PC deploys a
 * commit to the Oracle VM, and stops before a prompt change that no prompt eval run measured.
 * Everything it touches is handed in, so nothing here reaches git, the VM or the network.
 */

const NOW = 'bbbbbbb';
const LIVE = 'aaaaaaa';
const TURN_PROMPT = 'apps/api/src/manager/chat/turn/prompt.ts';

interface Told {
    /** `git status --porcelain` for tracked files. */
    status?: string;
    /** `git branch -r --contains`: the remote branches that have the commit. */
    onRemote?: string;
    /** The files changed between what live runs and the commit; "unknown" when git does not know the commit live runs. */
    changed?: string[] | 'unknown';
    reports?: { commit: string; dirty: boolean }[];
    /** What ssh ends with when the VM's deploy script is run: the script's own exit code, or 255 for a dropped connection. */
    deployExit?: number;
    /** What the VM runs once the script has ended; the commit deployed, unless told. */
    liveAfter?: string;
    /** What health answers, one a try. */
    health?: number[];
    live?: string;
}

function scripted(told: Told = {}) {
    const did: string[] = [];
    const lines: string[] = [];
    const asked: string[][] = [];
    let live = told.live ?? LIVE;
    const health = [...(told.health ?? [200])];
    const world: VmWorld = {
        git: (args) => {
            asked.push(args);
            if (args[0] === 'rev-parse') return NOW;
            if (args[0] === 'fetch') return '';
            if (args[0] === 'status') return told.status ?? '';
            if (args[0] === 'branch') return told.onRemote ?? '  origin/main';
            if (args[0] === 'show') return '#!/usr/bin/env bash\n';
            if (args[0] === 'diff') {
                if (told.changed === 'unknown') throw new Error('fatal: bad object');
                return (told.changed ?? ['apps/web/app/page.tsx']).join('\n');
            }
            throw new Error(`unexpected git ${args.join(' ')}`);
        },
        archive: (commit) => void did.push(`archive ${commit}`),
        stage: (name) => void did.push(`stage ${name}`),
        remote: {
            read: () => live,
            upload: (files) => void did.push(`upload ${files.join(' ')}`),
            run: (command) => {
                did.push(`run ${command}`);
                if ((told.deployExit ?? 0) === 0) live = told.liveAfter ?? NOW;
                return told.deployExit ?? 0;
            },
        },
        evalReports: () => told.reports ?? [],
        health: async () => health.shift() ?? 0,
        pause: async () => void did.push('pause'),
        log: (line) => void lines.push(line),
    };
    return { world, did, lines, asked };
}

const DEPLOYED = [`archive ${NOW}`, 'stage deploy.sh', 'upload release.tar.gz deploy.sh', `run bash /tmp/deploy.sh ${NOW}`];

describe('The deploy command', () => {
    it('archives the commit, uploads it with that commit’s own deploy script, runs the script, and says what live runs and that health answers', async () => {
        const { world, did, lines, asked } = scripted();

        await deployToVm({}, world);

        expect(did).toEqual(DEPLOYED);
        expect(lines.at(-1)).toBe(`Live runs ${NOW}; health answers 200.`);
        // The deploy script is the commit's, not the working tree's: a ref other than the one checked out brings its own.
        expect(asked).toContainEqual(['show', `${NOW}:scripts/vm/deploy.sh`]);
    });

    it('reads the ref as a commit, so a tag deploys the commit it names', async () => {
        const { world, asked } = scripted();

        await deployToVm({ ref: 'v1' }, world);

        expect(asked[0]).toEqual(['rev-parse', '--verify', '--short', 'v1^{commit}']);
    });

    it('refuses a ref that would reach git as an option', async () => {
        const { world, asked } = scripted();

        await expect(deployToVm({ ref: '-x' }, world)).rejects.toThrow('"-x" is not a ref.');
        expect(asked).toEqual([]);
    });

    it('refuses a working tree with uncommitted changes to tracked files, before anything is uploaded', async () => {
        const { world, did } = scripted({ status: ' M apps/api/src/main.ts' });

        await expect(deployToVm({}, world)).rejects.toThrow('uncommitted changes');
        expect(did).toEqual([]);
    });

    it('asks the remote what it has, then refuses a commit it does not have', async () => {
        const { world, did, asked } = scripted({ onRemote: '' });

        await expect(deployToVm({}, world)).rejects.toThrow(`The remote does not have ${NOW}: push it first.`);
        expect(did).toEqual([]);
        const order = asked.map((args) => args[0]);
        expect(order.indexOf('fetch')).toBeGreaterThan(-1);
        expect(order.indexOf('fetch')).toBeLessThan(order.indexOf('branch'));
    });

    it('says so and does nothing when live already runs the commit, however long live wrote its name', async () => {
        const { world, did, lines } = scripted({ live: `${NOW}0123456789abcdef` });

        await deployToVm({}, world);

        expect(did).toEqual([]);
        expect(lines.join('\n')).toContain(`Live already runs ${NOW}.`);
    });

    describe('a prompt change no eval run measured', () => {
        it('stops before uploading, names the prompt builders that changed and how to go ahead', async () => {
            const { world, did } = scripted({ changed: ['apps/web/app/page.tsx', TURN_PROMPT] });

            await expect(deployToVm({}, world)).rejects.toThrow(`No prompt eval run measured ${NOW}, and it changes a prompt: ${TURN_PROMPT}.`);
            await expect(deployToVm({}, world)).rejects.toThrow('--unmeasured');
            expect(did).toEqual([]);
        });

        it('goes ahead with the flag, and says it went unmeasured', async () => {
            const { world, did, lines } = scripted({ changed: [TURN_PROMPT] });

            await deployToVm({ unmeasured: true }, world);

            expect(did).toEqual(DEPLOYED);
            expect(lines.join('\n')).toContain(`Going ahead unmeasured: ${TURN_PROMPT}.`);
        });

        it('does not stop when a run of that commit, with a clean tree, is among the eval reports', async () => {
            const { world, did } = scripted({ changed: [TURN_PROMPT], reports: [{ commit: 'ccccccc', dirty: false }, { commit: NOW, dirty: false }] });

            await deployToVm({}, world);

            expect(did).toEqual(DEPLOYED);
        });

        it('does not count a run of that commit made with uncommitted changes', async () => {
            const { world } = scripted({ changed: [TURN_PROMPT], reports: [{ commit: NOW, dirty: true }] });

            await expect(deployToVm({}, world)).rejects.toThrow('No prompt eval run measured');
        });

        it('does not stop when no prompt builder changed', async () => {
            const { world, did } = scripted({ changed: ['apps/api/src/manager/chat/turn/reply-parser.ts', 'README.md'] });

            await deployToVm({}, world);

            expect(did).toEqual(DEPLOYED);
        });

        it('lists a moved file under both its names, so a prompt builder moved and changed is still seen', async () => {
            const { world, asked } = scripted();

            await deployToVm({}, world);

            expect(asked).toContainEqual(['diff', '--name-only', '--no-renames', LIVE, NOW]);
        });

        it('stops when git does not know the commit live runs, as it cannot say what changed; the flag goes ahead', async () => {
            const stopped = scripted({ changed: 'unknown' });
            await expect(deployToVm({}, stopped.world)).rejects.toThrow(`Git here does not know ${LIVE}, the commit live runs, so what changed cannot be listed.`);
            expect(stopped.did).toEqual([]);

            const went = scripted({ changed: 'unknown' });
            await deployToVm({ unmeasured: true }, went.world);
            expect(went.did).toEqual(DEPLOYED);
        });

        it('names prompt builders that are really there: a renamed one would switch the stop off without a word', () => {
            const root = path.resolve(__dirname, '..', '..', '..');

            expect(PROMPT_BUILDERS.filter((file) => !existsSync(path.join(root, file)))).toEqual([]);
            expect(PROMPT_BUILDERS).toContain(TURN_PROMPT);
        });
    });

    describe('when the deploy does not end well', () => {
        it('ends with the deploy script’s failure, and says what live still runs', async () => {
            const { world } = scripted({ deployExit: 1 });

            await expect(deployToVm({}, world)).rejects.toThrow(`The deploy script failed (exit 1). Live runs ${LIVE}.`);
        });

        it('a dropped connection is not a failed deploy: the script carries on by itself on the VM, and the command says where to look and not to run it again', async () => {
            const { world } = scripted({ deployExit: 255 });

            await expect(deployToVm({}, world)).rejects.toThrow('The connection to the VM dropped. The deploy carries on there by itself');
            await expect(deployToVm({}, world)).rejects.toThrow('do not deploy again until it has ended');
        });

        it('says so when the script ended and live runs another commit', async () => {
            const { world } = scripted({ liveAfter: LIVE });

            await expect(deployToVm({}, world)).rejects.toThrow(`The deploy script ended, but live runs ${LIVE}, not ${NOW}.`);
        });

        it('gives the app a little time to answer, then says so when health still does not', async () => {
            const slow = scripted({ health: [0, 502, 200] });
            await deployToVm({}, slow.world);
            expect(slow.lines.at(-1)).toBe(`Live runs ${NOW}; health answers 200.`);
            expect(slow.did.filter((one) => one === 'pause')).toHaveLength(2);

            const down = scripted({ health: [502, 502, 502, 502, 502, 502, 502, 502] });
            await expect(deployToVm({}, down.world)).rejects.toThrow(`Live runs ${NOW}, but health answers 502.`);
        });
    });
});

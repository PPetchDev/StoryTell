// The types of vm-deploy.mjs, for its test (apps/api/test/vm-deploy.spec.ts), which is TypeScript.

/** What the deploy command touches, handed in so its tests reach no git, no VM and no network. */
export interface VmWorld {
    /** Runs git in the checkout and answers what it printed; throws when git fails. */
    git(args: string[]): string;
    /** Archives the commit as `release.tar.gz` among the files to upload. */
    archive(commit: string): void;
    /** Puts a file of this name and text among the files to upload. */
    stage(name: string, text: string): void;
    remote: {
        /** Runs a command on the VM and answers what it printed. */
        read(command: string): string;
        /** Copies the named files, archived or staged before, to /tmp on the VM. */
        upload(names: string[]): void;
        /** Runs a command on the VM, showing its output as it comes; answers its exit code, 255 when the connection was lost. */
        run(command: string): number;
    };
    /** The commit and tree state of every saved prompt eval report. */
    evalReports(): { commit: string; dirty: boolean }[];
    /** The status the public health address answers with; 0 when it does not answer. */
    health(): Promise<number>;
    pause(ms: number): Promise<void>;
    log(line: string): void;
}

export class DeployStopped extends Error {}

/** The files whose change a prompt eval run should measure before it goes live. */
export const PROMPT_BUILDERS: string[];

export function deployToVm(options: { ref?: string; unmeasured?: boolean }, world: VmWorld): Promise<void>;

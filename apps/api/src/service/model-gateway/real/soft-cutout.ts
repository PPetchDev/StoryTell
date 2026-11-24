import { fork } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SoftCutoutUnsuitableError } from '../../../errors/image.errors.js';
import { ImageData } from '../model-gateway.js';
import { ENLARGE_BELOW, JOB_ARGUMENT, JOB_READY, readPicture, SoftCutoutAnswer, SoftCutoutJob } from './soft-cutout-job.js';
import { keyColour } from './soft-key.js';

export { keyColour, softCutout } from './soft-key.js';
export type { Picture } from './soft-key.js';

/** The name the usage record and the cut-out's result carry. */
export const SOFT_CUTOUT_MODEL = 'soft-key';
/** Where it runs: no provider at all. */
export const SOFT_CUTOUT_HOST = 'local';

/** `now`: made within the request. `later`: enlarged first, which takes minutes, so the request does not wait. */
export type SoftCutoutPlan = 'now' | 'later';

/** The job's file beside this one: `.ts` run from the source, `.js` from the build. */
const JOB_FILE = path.join(import.meta.dirname, `soft-cutout-job${path.extname(import.meta.filename)}`);

/**
 * The soft cut-out as the gateway uses it. Every cut-out is made in a process of its own, at low
 * priority (soft-cutout-job.ts): made inside the API, an enlargement stops every other request for
 * as long as it runs.
 */
export class SoftCutout {
    /** One picture at a time: a large picture keeps a core busy for seconds, an enlargement for minutes. */
    private last: Promise<unknown> = Promise.resolve();

    /**
     * `enlargeModelPath`: where that file is there, a small picture is enlarged two times first
     * (enlarge.ts says what the file may be).
     */
    constructor(private readonly enlargeModelPath?: string) {}

    /**
     * How this picture's cut-out would be made, with nothing made yet. Refused
     * (SoftCutoutUnsuitableError) where the background is not one flat, tinted colour.
     */
    async plan(image: ImageData): Promise<SoftCutoutPlan> {
        const picture = await readPicture(image.bytes);
        if (!keyColour(picture)) throw new SoftCutoutUnsuitableError();
        return picture.width < ENLARGE_BELOW && this.enlarges() ? 'later' : 'now';
    }

    /**
     * The picture with its background taken away, as a lossless WebP with transparency: the size it came in,
     * or two times that where it was enlarged first. Refused (SoftCutoutUnsuitableError) where the
     * background is not one flat, tinted colour.
     */
    removeBackground(image: ImageData): Promise<ImageData> {
        const turn = this.last.then(() => this.inItsOwnProcess({ bytes: image.bytes, enlargeModelPath: this.enlarges() ? this.enlargeModelPath! : null }));
        this.last = turn.catch(() => undefined);
        return turn;
    }

    /** Whether a small picture is enlarged first here. */
    enlarges(): boolean {
        return this.enlargeModelPath !== undefined && existsSync(this.enlargeModelPath);
    }

    private inItsOwnProcess(job: SoftCutoutJob): Promise<ImageData> {
        return new Promise((resolve, reject) => {
            // `advanced`: the picture's bytes go over as bytes. No `execArgv`: the job needs none of the API's own flags.
            const child = fork(JOB_FILE, [JOB_ARGUMENT], { execArgv: [], serialization: 'advanced' });
            try {
                // The app comes first on a computer with few cores: the job gets what is left over.
                if (child.pid !== undefined) os.setPriority(child.pid, os.constants.priority.PRIORITY_LOW);
            } catch {
                // Not allowed here: it runs at the API's own priority.
            }
            let answered = false;
            child.on('message', (message: typeof JOB_READY | SoftCutoutAnswer) => {
                if (message === JOB_READY) return void child.send(job);
                answered = true;
                if ('cut' in message) resolve({ bytes: Buffer.from(message.cut), mimeType: 'image/webp' });
                else if ('unsuitable' in message) reject(new SoftCutoutUnsuitableError());
                else reject(new Error(message.failed));
            });
            child.on('error', reject);
            child.on('exit', (code, signal) => {
                if (!answered) reject(new Error(`The soft cut-out's process ended with no answer (${signal ?? `exit code ${code}`}).`));
            });
        });
    }
}

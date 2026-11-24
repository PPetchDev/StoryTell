import sharp from 'sharp';

import { Enlarger } from './enlarge.ts';
import { keyColour, softCutout } from './soft-key.ts';
import type { Picture } from './soft-key.ts';

/**
 * The work of one soft cut-out, and the process that does it (.scratch/soft-cutout/spec.md, "In a
 * process of its own"). onnxruntime works a tile out in one piece on the thread that asked, for
 * seconds, and the cut-out itself is a second of plain arithmetic: inside the API either one stops
 * every other request. So the API starts this file as a process of its own for each cut-out.
 *
 * It is started as a file, from the source in tests and from the build on a server. Its imports
 * of this folder's files are therefore written `.ts` (the build rewrites them), and it and what it
 * imports hold only syntax Node runs as it is: no decorators, no constructor parameter properties.
 */

/** A picture narrower than this is enlarged before it is cut out, where the enlargement model is there. */
export const ENLARGE_BELOW = 1200;

/** What the API sends for one cut-out. `enlargeModelPath`: null where nothing is enlarged here. */
export interface SoftCutoutJob {
    bytes: Uint8Array;
    enlargeModelPath: string | null;
}

/** What comes back: the cut-out, or that the picture is not fit for one, or what went wrong. */
export type SoftCutoutAnswer = { cut: Uint8Array } | { unsuitable: true } | { failed: string };

/** The first thing the process says, once it listens: only then is the job sent. */
export const JOB_READY = 'ready';
/** The argument that makes this file do a job. Without it, it is only imported. */
export const JOB_ARGUMENT = '--soft-cutout-job';

/** The picture's colours, turned upright first, as a phone's photo says which way is up in its metadata. */
export async function readPicture(bytes: Uint8Array): Promise<Picture> {
    const upright = await sharp(bytes).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    return { rgb: upright.data, width: upright.info.width, height: upright.info.height };
}

/**
 * The picture with its background taken away, as a lossless WebP with transparency: the size it came
 * in, or two times that where it was enlarged first. `null` where the background is not one flat,
 * tinted colour.
 */
export async function cutOut({ bytes, enlargeModelPath }: SoftCutoutJob): Promise<Buffer | null> {
    const drawn = await readPicture(bytes);
    // Refused before the minutes of an enlargement, not after.
    if (!keyColour(drawn)) return null;
    const picture = enlargeModelPath && drawn.width < ENLARGE_BELOW ? await new Enlarger(enlargeModelPath).enlarge(drawn) : drawn;
    const rgba = softCutout(picture);
    if (!rgba) return null;
    // Lossless WebP: a third of the PNG's size, which matters at two times the picture's size.
    return sharp(rgba, { raw: { width: picture.width, height: picture.height, channels: 4 } }).webp({ lossless: true }).toBuffer();
}

if (process.send && process.argv.includes(JOB_ARGUMENT)) {
    // The API is gone (stopped, restarted): nobody waits for this cut-out.
    process.on('disconnect', () => process.exit(1));
    process.once('message', async (job: SoftCutoutJob) => {
        let answer: SoftCutoutAnswer;
        try {
            const cut = await cutOut(job);
            answer = cut ? { cut } : { unsuitable: true };
        } catch (error) {
            answer = { failed: error instanceof Error ? error.message : String(error) };
        }
        process.send!(answer, () => process.exit(0));
    });
    process.send(JOB_READY);
}

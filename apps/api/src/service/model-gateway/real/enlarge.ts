import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';

import { Picture } from './soft-cutout.js';

/**
 * Enlarges a drawn picture two times (.scratch/soft-cutout/spec.md, "Enlarged first"), with a model
 * trained on drawn pictures, run on this computer in overlapping tiles. Slow without a graphics card:
 * about a minute a picture on the PC and six on the live VM, so a caller never makes a request wait for it.
 */

/** How many times wider and taller the answer is. */
export const ENLARGE_FACTOR = 2;
const TILE = 192;
const PAD = 16;

/** The model as the enlarger needs it: a tile of colours in (planes of red, green, blue, 0..1), the same tile two times the size out. */
export type EnlargeModel = (input: Float32Array, width: number, height: number) => Promise<Float32Array>;

/** Loads the model file with onnxruntime, on the first enlargement only: the API starts without it. */
export function onnxEnlargeModel(modelPath: string): EnlargeModel {
    let session: Promise<EnlargeModel> | undefined;
    return async (input, width, height) => {
        session ??= (async () => {
            const ort = await import('onnxruntime-node');
            // One core is left for the app: an enlargement runs for minutes.
            const inference = await ort.InferenceSession.create(modelPath, { intraOpNumThreads: Math.max(1, availableParallelism() - 1) });
            return async (values: Float32Array, tileWidth: number, tileHeight: number) => {
                const answer = await inference.run({ [inference.inputNames[0]]: new ort.Tensor('float32', values, [1, 3, tileHeight, tileWidth]) });
                return answer[inference.outputNames[0]].data as Float32Array;
            };
        })();
        // A model that failed to load is tried again on the next enlargement.
        session.catch(() => (session = undefined));
        return (await session)(input, width, height);
    };
}

export class Enlarger {
    constructor(
        private readonly modelPath: string,
        private readonly model: EnlargeModel = onnxEnlargeModel(modelPath),
    ) {}

    /** Whether the model file is there. Without it nothing is enlarged. */
    available(): boolean {
        return existsSync(this.modelPath);
    }

    /** The picture two times as wide and as tall. Each tile is read with a margin of its neighbours, so no seam shows. */
    async enlarge({ rgb, width, height }: Picture): Promise<Picture> {
        const bigWidth = width * ENLARGE_FACTOR;
        const big = Buffer.alloc(bigWidth * height * ENLARGE_FACTOR * 3);
        for (let tileTop = 0; tileTop < height; tileTop += TILE) {
            for (let tileLeft = 0; tileLeft < width; tileLeft += TILE) {
                const left = Math.max(0, tileLeft - PAD);
                const top = Math.max(0, tileTop - PAD);
                const tileWidth = Math.min(width, tileLeft + TILE + PAD) - left;
                const tileHeight = Math.min(height, tileTop + TILE + PAD) - top;
                const plane = tileWidth * tileHeight;
                const input = new Float32Array(3 * plane);
                for (let y = 0; y < tileHeight; y++) {
                    for (let x = 0; x < tileWidth; x++) {
                        const pixel = ((top + y) * width + left + x) * 3;
                        for (let channel = 0; channel < 3; channel++) input[channel * plane + y * tileWidth + x] = rgb[pixel + channel] / 255;
                    }
                }
                const answer = await this.model(input, tileWidth, tileHeight);
                const outWidth = tileWidth * ENLARGE_FACTOR;
                const outPlane = plane * ENLARGE_FACTOR * ENLARGE_FACTOR;
                // The tile's own area, without its margin.
                const fromX = (tileLeft - left) * ENLARGE_FACTOR;
                const fromY = (tileTop - top) * ENLARGE_FACTOR;
                const ownWidth = (Math.min(width, tileLeft + TILE) - tileLeft) * ENLARGE_FACTOR;
                const ownHeight = (Math.min(height, tileTop + TILE) - tileTop) * ENLARGE_FACTOR;
                for (let y = 0; y < ownHeight; y++) {
                    for (let x = 0; x < ownWidth; x++) {
                        const target = ((tileTop * ENLARGE_FACTOR + y) * bigWidth + tileLeft * ENLARGE_FACTOR + x) * 3;
                        const from = (fromY + y) * outWidth + fromX + x;
                        for (let channel = 0; channel < 3; channel++) {
                            big[target + channel] = Math.max(0, Math.min(255, Math.round(answer[channel * outPlane + from] * 255)));
                        }
                    }
                }
            }
        }
        return { rgb: big, width: bigWidth, height: height * ENLARGE_FACTOR };
    }
}

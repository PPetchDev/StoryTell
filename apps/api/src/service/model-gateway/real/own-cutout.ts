import { existsSync } from 'node:fs';

import sharp from 'sharp';

import { ImageData } from '../model-gateway.js';

/**
 * The app's own background remover (.scratch/own-cutout/spec.md): a matting model trained on drawn
 * characters, run on this computer, then a clean-up for pictures drawn on one flat colour. It costs
 * nothing a picture, and leaves no fringe of the old background, which Venice's remover did on
 * pictures drawn on white.
 */

/** The name the usage record and the cut-out's result carry. */
export const OWN_CUTOUT_MODEL = 'isnet-anime';
/** Where it runs: no provider at all. */
export const OWN_CUTOUT_HOST = 'local';

/** The model reads a square of this side. */
const MODEL_SIDE = 1024;
/** What the model was trained to have taken from each colour channel, after scaling to 0..1. */
const MODEL_MEAN = [0.485, 0.456, 0.406];

/** How far a channel may be from the background's colour and still be the background. */
const BACKGROUND_REACH = 20;
/** A pixel this close to the background's colour, which the model was not sure is figure, is background. */
const SURE_BACKGROUND_REACH = 8;
const DOUBTED_BELOW = 200;
/** The share of the picture's outer ring that must be one colour for the background to count as flat. */
const FLAT_SHARE = 0.9;
const FLAT_REACH = 14;

export interface Matte {
    /** The picture's colours, three bytes a pixel. */
    rgb: Buffer;
    /** How much of each pixel is figure, as the model sees it: one byte a pixel. */
    alpha: Buffer;
    width: number;
    height: number;
}

/**
 * The model's matte made ready to show. Where the picture's background is one flat colour:
 * - what is drawn beside the figure (a heart, spark lines) comes back, as the model fades or drops it;
 * - background colour the model doubted (inside a tiara's loop, between strands of hair) goes;
 * - background colour still touching the see-through area goes, the drawing's own outlines stopping the spread,
 *   so white gloves inside an outline stay.
 * A soft grey shadow on the ground is not a mark and stays out. On any other background the model's
 * matte is kept as it is. The answer is one byte of alpha a pixel.
 */
export function finishMatte({ rgb, alpha: modelAlpha, width, height }: Matte): Buffer {
    const count = width * height;
    const alpha = Buffer.from(modelAlpha);

    const margin = Math.max(2, Math.round(Math.min(width, height) * 0.015));
    const ring: number[] = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x < margin || y < margin || x >= width - margin || y >= height - margin) ring.push(y * width + x);
        }
    }
    const median = (channel: number) => {
        const values = ring.map((pixel) => rgb[pixel * 3 + channel]).sort((a, b) => a - b);
        return values[values.length >> 1];
    };
    const background = [median(0), median(1), median(2)];
    const off = (pixel: number) =>
        Math.max(
            Math.abs(rgb[pixel * 3] - background[0]),
            Math.abs(rgb[pixel * 3 + 1] - background[1]),
            Math.abs(rgb[pixel * 3 + 2] - background[2]),
        );
    const flat = ring.filter((pixel) => off(pixel) <= FLAT_REACH).length / ring.length >= FLAT_SHARE;
    if (!flat) return alpha;

    for (let pixel = 0; pixel < count; pixel++) {
        const distance = off(pixel);
        if (distance <= BACKGROUND_REACH) {
            if (distance <= SURE_BACKGROUND_REACH && alpha[pixel] < DOUBTED_BELOW) alpha[pixel] = 0;
            continue;
        }
        if (alpha[pixel] >= 128) continue;
        // Drawn beside the figure: coloured or dark, never a soft grey shadow.
        const red = rgb[pixel * 3];
        const green = rgb[pixel * 3 + 1];
        const blue = rgb[pixel * 3 + 2];
        const most = Math.max(red, green, blue);
        if (most - Math.min(red, green, blue) > 45 || most < 100) {
            alpha[pixel] = Math.max(alpha[pixel], Math.min(255, Math.round((distance - BACKGROUND_REACH) * 6)));
        }
    }

    // Flood from every see-through pixel through pixels of the background's colour.
    const queue = new Int32Array(count);
    const seen = new Uint8Array(count);
    let head = 0;
    let tail = 0;
    for (let pixel = 0; pixel < count; pixel++) {
        if (alpha[pixel] < 128) {
            seen[pixel] = 1;
            queue[tail++] = pixel;
        }
    }
    while (head < tail) {
        const pixel = queue[head++];
        const x = pixel % width;
        const neighbours = [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, pixel - width, pixel + width];
        for (const next of neighbours) {
            if (next < 0 || next >= count || seen[next]) continue;
            seen[next] = 1;
            if (off(next) <= BACKGROUND_REACH) {
                alpha[next] = 0;
                queue[tail++] = next;
            }
        }
    }
    return alpha;
}

/** One channel of a raw image, read by the stride sharp answered with (a one-channel image can come back with three). */
function firstChannel(data: Buffer, channels: number, count: number): Buffer {
    const out = Buffer.alloc(count);
    for (let pixel = 0; pixel < count; pixel++) out[pixel] = data[pixel * channels];
    return out;
}

/** The model as the remover needs it: a square of colours in, how much of each pixel is figure out. */
export type MatteModel = (input: Float32Array, side: number) => Promise<Float32Array>;

/** Loads the model file with onnxruntime, on the first cut-out only: the API starts without it. */
export function onnxMatteModel(modelPath: string): MatteModel {
    let session: Promise<{ run(input: Float32Array, side: number): Promise<Float32Array> }> | undefined;
    return async (input, side) => {
        session ??= (async () => {
            const ort = await import('onnxruntime-node');
            const inference = await ort.InferenceSession.create(modelPath);
            return {
                run: async (values: Float32Array, size: number) => {
                    const answer = await inference.run({ [inference.inputNames[0]]: new ort.Tensor('float32', values, [1, 3, size, size]) });
                    return answer[inference.outputNames[0]].data as Float32Array;
                },
            };
        })();
        // A model that failed to load is tried again on the next cut-out.
        session.catch(() => (session = undefined));
        return (await session).run(input, side);
    };
}

export class OwnCutout {
    /** One picture at a time: the model takes all the cores it is given. */
    private last: Promise<unknown> = Promise.resolve();

    constructor(
        private readonly modelPath: string,
        private readonly model: MatteModel = onnxMatteModel(modelPath),
    ) {}

    /** Whether the model file is there. Without it the gateway falls back to Venice's remover. */
    available(): boolean {
        return existsSync(this.modelPath);
    }

    /** The picture with its background taken away, as a PNG with transparency, the size it came in. */
    removeBackground(image: ImageData): Promise<ImageData> {
        const turn = this.last.then(() => this.cut(image.bytes));
        this.last = turn.catch(() => undefined);
        return turn;
    }

    private async cut(bytes: Buffer): Promise<ImageData> {
        // Turned upright first, as a phone's photo says which way is up in its metadata.
        const upright = await sharp(bytes).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
        const { width, height } = upright.info;
        const count = width * height;
        const rgb = upright.data;

        const square = await sharp(rgb, { raw: { width, height, channels: 3 } })
            .resize(MODEL_SIDE, MODEL_SIDE, { fit: 'fill', kernel: 'lanczos3' })
            .raw()
            .toBuffer();
        let brightest = 1;
        for (const value of square) if (value > brightest) brightest = value;
        const plane = MODEL_SIDE * MODEL_SIDE;
        const input = new Float32Array(3 * plane);
        for (let pixel = 0; pixel < plane; pixel++) {
            for (let channel = 0; channel < 3; channel++) input[channel * plane + pixel] = square[pixel * 3 + channel] / brightest - MODEL_MEAN[channel];
        }
        const answer = await this.model(input, MODEL_SIDE);
        let low = Infinity;
        let high = -Infinity;
        for (let pixel = 0; pixel < plane; pixel++) {
            if (answer[pixel] < low) low = answer[pixel];
            if (answer[pixel] > high) high = answer[pixel];
        }
        const small = Buffer.alloc(plane);
        for (let pixel = 0; pixel < plane; pixel++) small[pixel] = Math.round(((answer[pixel] - low) / (high - low || 1)) * 255);
        const sized = await sharp(small, { raw: { width: MODEL_SIDE, height: MODEL_SIDE, channels: 1 } })
            .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
            .raw()
            .toBuffer({ resolveWithObject: true });

        const alpha = finishMatte({ rgb, alpha: firstChannel(sized.data, sized.info.channels, count), width, height });
        // A slightly soft edge, never wider than the matte itself.
        const blurred = await sharp(alpha, { raw: { width, height, channels: 1 } }).blur(0.8).raw().toBuffer({ resolveWithObject: true });
        const soft = firstChannel(blurred.data, blurred.info.channels, count);
        const out = Buffer.alloc(count * 4);
        for (let pixel = 0; pixel < count; pixel++) {
            out[pixel * 4] = rgb[pixel * 3];
            out[pixel * 4 + 1] = rgb[pixel * 3 + 1];
            out[pixel * 4 + 2] = rgb[pixel * 3 + 2];
            const edge = Math.min(1, Math.max(0, (soft[pixel] / 255 - 0.45) / 0.5));
            out[pixel * 4 + 3] = Math.min(alpha[pixel], Math.round(edge * 255));
        }
        return { bytes: await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer(), mimeType: 'image/png' };
    }
}

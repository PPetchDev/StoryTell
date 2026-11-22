import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import sharp from 'sharp';

import { FAKE_PNG } from '../src/service/model-gateway/fake-model-gateway.js';
import { finishMatte, MatteModel, OWN_CUTOUT_HOST, OWN_CUTOUT_MODEL, OwnCutout } from '../src/service/model-gateway/real/own-cutout.js';
import { gatewayUnderTest } from './harness/gateway-under-test.js';
import { recordedFetch } from './harness/recorded-fetch.js';

type Colour = [number, number, number];
const WHITE: Colour = [254, 254, 254];
const PINK: Colour = [240, 120, 150];
const YELLOW: Colour = [250, 210, 40];
const GREY: Colour = [205, 203, 204];
const NEAR_WHITE: Colour = [250, 250, 252];
const OUTLINE: Colour = [90, 50, 40];

/** A small synthetic picture: a background, with rectangles painted over it in order. */
function picture(width: number, height: number, background: Colour, shapes: { at: [number, number, number, number]; colour: Colour }[]) {
    const rgb = Buffer.alloc(width * height * 3);
    for (let pixel = 0; pixel < width * height; pixel++) rgb.set(background, pixel * 3);
    for (const { at: [left, top, right, bottom], colour } of shapes) {
        for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) rgb.set(colour, (y * width + x) * 3);
    }
    return { rgb, width, height };
}

/** A matte as the model would give it: `inside` figure, everything else background, with `also` set by hand. */
function matte(width: number, height: number, inside: [number, number, number, number], also: { at: [number, number, number, number]; alpha: number }[] = []) {
    const alpha = Buffer.alloc(width * height);
    const fill = ([left, top, right, bottom]: [number, number, number, number], value: number) => {
        for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) alpha[y * width + x] = value;
    };
    fill(inside, 255);
    for (const one of also) fill(one.at, one.alpha);
    return alpha;
}

// .scratch/own-cutout/spec.md
describe("The app's own background remover", () => {
    describe('finishing the matte of a picture drawn on one flat colour', () => {
        const W = 60;
        const H = 60;
        const at = (alpha: Buffer, x: number, y: number) => alpha[y * W + x];

        it('brings back a coloured mark beside the figure that the model dropped, and leaves a soft grey shadow out', () => {
            const { rgb } = picture(W, H, WHITE, [
                { at: [20, 15, 40, 50], colour: PINK },
                { at: [46, 6, 54, 12], colour: YELLOW },
                { at: [15, 52, 45, 56], colour: GREY },
            ]);

            const alpha = finishMatte({ rgb, alpha: matte(W, H, [20, 15, 40, 50]), width: W, height: H });

            expect(at(alpha, 30, 30)).toBe(255);
            expect(at(alpha, 50, 9)).toBe(255);
            expect(at(alpha, 30, 54)).toBe(0);
            expect(at(alpha, 5, 5)).toBe(0);
        });

        it('clears background colour the model doubted, and background colour touching the see-through area, but not white inside an outline', () => {
            const { rgb } = picture(W, H, WHITE, [
                { at: [14, 14, 46, 46], colour: OUTLINE },
                { at: [16, 16, 44, 44], colour: PINK },
                // A white glove inside the figure, which the model is sure of.
                { at: [20, 20, 30, 30], colour: NEAR_WHITE },
                // A gap of plain background inside a loop, which the model half took for figure.
                { at: [34, 34, 40, 40], colour: WHITE },
            ]);
            // The model's matte runs two pixels past the outline: a fringe of background.
            const model = matte(W, H, [12, 12, 48, 48], [{ at: [34, 34, 40, 40], alpha: 190 }]);

            const alpha = finishMatte({ rgb, alpha: model, width: W, height: H });

            expect(at(alpha, 12, 30)).toBe(0); // the fringe
            expect(at(alpha, 14, 30)).toBe(255); // the outline
            expect(at(alpha, 25, 25)).toBe(255); // the glove
            expect(at(alpha, 37, 37)).toBe(0); // the gap in the loop
        });

        it('leaves a ground shadow out on a coloured background: never a mark, and cleared at the foot where the model kept it, with outlined shoes left', () => {
            const paper: Colour = [232, 208, 182];
            const shadow: Colour = [171, 144, 117];
            const sandal: Colour = [181, 131, 96];
            const { rgb } = picture(W, H, paper, [
                { at: [22, 4, 38, 44], colour: PINK },
                // The shadow on the ground, wider than the figure.
                { at: [10, 49, 50, 55], colour: shadow },
                // A sandal the shadow's own colour, inside a dark outline, standing in the shadow.
                { at: [24, 42, 36, 52], colour: OUTLINE },
                { at: [26, 44, 34, 50], colour: sandal },
                // A coloured mark up beside the figure.
                { at: [46, 6, 54, 12], colour: YELLOW },
            ]);
            // The model took the figure, the sandal and the middle of the shadow.
            const model = matte(W, H, [22, 4, 38, 52], [{ at: [16, 49, 44, 55], alpha: 255 }]);

            const alpha = finishMatte({ rgb, alpha: model, width: W, height: H });

            expect(at(alpha, 12, 52)).toBe(0); // shadow the model left out: not a mark
            expect(at(alpha, 18, 52)).toBe(0); // shadow the model kept
            expect(at(alpha, 42, 50)).toBe(0);
            expect(at(alpha, 30, 53)).toBe(0); // and under the sandal
            expect(at(alpha, 30, 47)).toBe(255); // the sandal
            expect(at(alpha, 25, 47)).toBe(255); // its outline
            expect(at(alpha, 30, 25)).toBe(255); // the figure
            expect(at(alpha, 50, 9)).toBe(255); // the mark
        });

        it('keeps a pale mark with a channel still at the background’s, as a sweat drop is', () => {
            const drop: Colour = [200, 226, 250];
            const { rgb } = picture(W, H, WHITE, [{ at: [20, 15, 40, 50], colour: PINK }, { at: [46, 6, 54, 12], colour: drop }]);

            const alpha = finishMatte({ rgb, alpha: matte(W, H, [20, 15, 40, 50]), width: W, height: H });

            expect(at(alpha, 50, 9)).toBeGreaterThan(120);
        });

        it('works the same on a dark flat background', () => {
            const dark: Colour = [22, 19, 30];
            const { rgb } = picture(W, H, dark, [{ at: [20, 15, 40, 50], colour: PINK }, { at: [46, 6, 54, 12], colour: YELLOW }]);

            const alpha = finishMatte({ rgb, alpha: matte(W, H, [18, 13, 42, 52]), width: W, height: H });

            expect(at(alpha, 18, 30)).toBe(0);
            expect(at(alpha, 30, 30)).toBe(255);
            expect(at(alpha, 50, 9)).toBe(255);
        });

        it("keeps the model's matte as it is on a background that is not one colour", () => {
            const { rgb } = picture(W, H, WHITE, [
                { at: [0, 0, 30, 60], colour: [40, 90, 60] },
                { at: [20, 15, 40, 50], colour: PINK },
                { at: [46, 6, 54, 12], colour: YELLOW },
            ]);
            const model = matte(W, H, [18, 13, 42, 52]);

            expect(finishMatte({ rgb, alpha: model, width: W, height: H })).toEqual(model);
        });
    });

    describe('cutting a picture out', () => {
        /** A model that calls the middle of its square figure, whatever it is shown. */
        const middle: MatteModel = async (_input, side) => {
            const out = new Float32Array(side * side);
            for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) out[y * side + x] = x > side * 0.3 && x < side * 0.7 && y > side * 0.2 && y < side * 0.8 ? 0.98 : 0.01;
            return out;
        };
        const source = async () => {
            const { rgb, width, height } = picture(80, 120, WHITE, [{ at: [24, 24, 56, 96], colour: PINK }]);
            return { bytes: await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer(), mimeType: 'image/png' };
        };

        it('answers a PNG the size of the picture, see-through outside the figure, with the figure in its own colours', async () => {
            const seen: { length: number; side: number }[] = [];
            const cutout = new OwnCutout('unused.onnx', async (input, side) => {
                seen.push({ length: input.length, side });
                return middle(input, side);
            });

            const result = await cutout.removeBackground(await source());

            expect(seen).toEqual([{ length: 3 * 1024 * 1024, side: 1024 }]);
            expect(result.mimeType).toBe('image/png');
            const { data, info } = await sharp(result.bytes).raw().toBuffer({ resolveWithObject: true });
            expect([info.width, info.height, info.channels]).toEqual([80, 120, 4]);
            const pixel = (x: number, y: number) => Array.from(data.subarray((y * 80 + x) * 4, (y * 80 + x) * 4 + 4));
            expect(pixel(40, 60)).toEqual([...PINK, 255]);
            expect(pixel(5, 5)[3]).toBe(0);
            expect(pixel(40, 110)[3]).toBe(0);
        });

        it('cuts one picture at a time, in the order asked', async () => {
            const order: string[] = [];
            let running = 0;
            const cutout = new OwnCutout('unused.onnx', async (input, side) => {
                expect(++running).toBe(1);
                await new Promise((resolve) => setTimeout(resolve, 5));
                running--;
                order.push('cut');
                return middle(input, side);
            });
            const picture = await source();

            await Promise.all([cutout.removeBackground(picture), cutout.removeBackground(picture), cutout.removeBackground(picture)]);

            expect(order).toHaveLength(3);
        });

        it('a picture that fails does not stop the next one', async () => {
            let calls = 0;
            const cutout = new OwnCutout('unused.onnx', async (input, side) => {
                if (calls++ === 0) throw new Error('model broke');
                return middle(input, side);
            });

            await expect(cutout.removeBackground(await source())).rejects.toThrow('model broke');
            await expect(cutout.removeBackground(await source())).resolves.toMatchObject({ mimeType: 'image/png' });
        });

        it('is available only where its model file is', () => {
            expect(new OwnCutout(path.join(tmpdir(), 'no-such-model.onnx'), middle).available()).toBe(false);
            expect(new OwnCutout(import.meta.filename, middle).available()).toBe(true);
        });
    });

    describe('in the gateway', () => {
        const request = { kind: 'image_cutout' as const, prompt: '', referenceImages: [FAKE_PNG], servedFor: { storyId: 7 } };
        const cut = { bytes: Buffer.from('own cut-out'), mimeType: 'image/png' };

        it('makes the cut-out itself, with no call to Venice, and records it at no cost', async () => {
            const net = recordedFetch([]);
            const asked: Buffer[] = [];
            const { gateway, records } = gatewayUnderTest(net.fetch, {
                ownCutout: {
                    available: () => true,
                    removeBackground: async (image) => {
                        asked.push(image.bytes);
                        return cut;
                    },
                },
            });

            const result = await gateway.generateImage(request);

            expect(net.requests).toEqual([]);
            expect(asked).toEqual([FAKE_PNG.bytes]);
            expect(result).toEqual({ image: cut, model: OWN_CUTOUT_MODEL, costUsd: 0 });
            expect(records).toEqual([expect.objectContaining({ kind: 'image_cutout', pool: 'image', model: 'isnet-anime', host: OWN_CUTOUT_HOST, images: 1, costUsd: 0, storyId: 7 })]);
            expect(gateway.cutoutPriceUsd()).toBe(0);
        });

        it("goes to Venice at Venice's price where the model file is missing", async () => {
            const net = recordedFetch([{ bytes: Buffer.from('venice cut-out'), contentType: 'image/png' }]);
            const { gateway, records } = gatewayUnderTest(net.fetch, { ownCutout: { available: () => false, removeBackground: async () => cut } });

            const result = await gateway.generateImage(request);

            expect(net.requests).toHaveLength(1);
            expect(net.requests[0].url).toBe('https://api.venice.ai/api/v1/image/background-remove');
            expect(result.model).toBe('background-remove');
            expect(records).toEqual([expect.objectContaining({ model: 'background-remove', host: 'venice', costUsd: 0.03 })]);
            expect(gateway.cutoutPriceUsd()).toBe(0.03);
        });
    });

    // Runs only on a computer that has the model file (CUTOUT_MODEL): the real model on a drawn figure.
    const model = process.env.CUTOUT_MODEL;
    it.skipIf(!model || !existsSync(model))('the real model takes a flat background away from a drawn figure', async () => {
        const { rgb, width, height } = picture(256, 384, WHITE, [
            { at: [88, 60, 168, 340], colour: OUTLINE },
            { at: [92, 64, 164, 336], colour: PINK },
            { at: [104, 80, 152, 130], colour: [250, 215, 190] },
        ]);
        const bytes = await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();

        const result = await new OwnCutout(model!).removeBackground({ bytes, mimeType: 'image/png' });

        const { data } = await sharp(result.bytes).raw().toBuffer({ resolveWithObject: true });
        expect(data[(10 * 256 + 10) * 4 + 3]).toBe(0);
        expect(data[(200 * 256 + 128) * 4 + 3]).toBeGreaterThan(200);
    }, 60_000);
});

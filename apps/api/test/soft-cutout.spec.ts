import sharp from 'sharp';

import { FAKE_PNG } from '../src/service/model-gateway/fake-model-gateway.js';
import { Enlarger, EnlargeModel } from '../src/service/model-gateway/real/enlarge.js';
import { SOFT_CUTOUT_HOST, SOFT_CUTOUT_MODEL, SoftCutout, softCutout } from '../src/service/model-gateway/real/soft-cutout.js';
import { gatewayUnderTest } from './harness/gateway-under-test.js';
import { recordedFetch } from './harness/recorded-fetch.js';

type Colour = [number, number, number];
const PURPLE: Colour = [113, 85, 131];
const WHITE: Colour = [252, 252, 252];
const BLACK: Colour = [24, 24, 28];
const RED: Colour = [200, 40, 50];

const W = 120;
const H = 120;

/** A small synthetic picture: a background, with rectangles painted over it in order. */
function picture(background: Colour, shapes: { at: [number, number, number, number]; colour: Colour }[]) {
    const rgb = Buffer.alloc(W * H * 3);
    for (let pixel = 0; pixel < W * H; pixel++) rgb.set(background, pixel * 3);
    for (const { at: [left, top, right, bottom], colour } of shapes) {
        for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) rgb.set(colour, (y * W + x) * 3);
    }
    return { rgb, width: W, height: H };
}
const alphaAt = (rgba: Buffer, x: number, y: number) => rgba[(y * W + x) * 4 + 3];
const colourAt = (rgba: Buffer, x: number, y: number) => [...rgba.subarray((y * W + x) * 4, (y * W + x) * 4 + 3)];

// .scratch/soft-cutout/spec.md
describe('The soft cut-out', () => {
    describe('of a picture drawn on one flat, tinted colour', () => {
        it('keeps a white part that touches the background with no outline, and clears the background', () => {
            const cut = softCutout(picture(PURPLE, [{ at: [30, 30, 90, 90], colour: BLACK }, { at: [30, 10, 90, 30], colour: WHITE }]))!;

            expect(alphaAt(cut, 60, 20)).toBe(255);
            expect(colourAt(cut, 60, 20)).toEqual(WHITE);
            expect(alphaAt(cut, 60, 60)).toBe(255);
            expect(alphaAt(cut, 5, 5)).toBe(0);
            expect(alphaAt(cut, 110, 60)).toBe(0);
        });

        it('makes a pixel half figure and half background half see-through, in the figure colour with no tint of the background', () => {
            const mixed: Colour = [Math.round((RED[0] + PURPLE[0]) / 2), Math.round((RED[1] + PURPLE[1]) / 2), Math.round((RED[2] + PURPLE[2]) / 2)];
            const cut = softCutout(picture(PURPLE, [{ at: [29, 30, 91, 90], colour: mixed }, { at: [30, 30, 90, 90], colour: RED }]))!;

            const alpha = alphaAt(cut, 29, 60);
            expect(alpha).toBeGreaterThan(100);
            expect(alpha).toBeLessThan(155);
            const [red, green, blue] = colourAt(cut, 29, 60);
            expect(Math.abs(red - RED[0])).toBeLessThan(12);
            expect(Math.abs(green - RED[1])).toBeLessThan(12);
            expect(Math.abs(blue - RED[2])).toBeLessThan(12);
        });

        it('clears the background showing through a gap closed in by the figure', () => {
            const cut = softCutout(picture(PURPLE, [{ at: [20, 20, 100, 100], colour: BLACK }, { at: [45, 45, 75, 75], colour: PURPLE }]))!;

            expect(alphaAt(cut, 60, 60)).toBe(0);
            expect(alphaAt(cut, 30, 60)).toBe(255);
        });

        it('drops a stray speck joined to nothing', () => {
            const cut = softCutout(picture(PURPLE, [{ at: [20, 20, 100, 100], colour: BLACK }, { at: [5, 5, 8, 8], colour: RED }]))!;

            expect(alphaAt(cut, 6, 6)).toBe(0);
            expect(alphaAt(cut, 60, 60)).toBe(255);
        });
    });

    it('answers nothing for a white background, where white fur could not be told from it', () => {
        expect(softCutout(picture([254, 254, 254], [{ at: [30, 30, 90, 90], colour: BLACK }]))).toBeNull();
    });

    it('answers nothing for a background that is not one colour', () => {
        const scenery = picture(PURPLE, [{ at: [0, 0, 120, 40], colour: [60, 140, 200] }, { at: [0, 80, 120, 120], colour: [40, 120, 60] }, { at: [40, 30, 80, 100], colour: BLACK }]);

        expect(softCutout(scenery)).toBeNull();
    });

    describe('cutting a picture out', () => {
        const encoded = async (background: Colour) => {
            const { rgb } = picture(background, [{ at: [30, 30, 90, 90], colour: BLACK }]);
            return { bytes: await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer(), mimeType: 'image/png' };
        };

        it('answers a lossless WebP the size of the picture, see-through outside the figure', async () => {
            const cut = await new SoftCutout().removeBackground(await encoded(PURPLE));

            expect(cut.mimeType).toBe('image/webp');
            const { data, info } = await sharp(cut.bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            expect([info.width, info.height]).toEqual([W, H]);
            expect(alphaAt(data, 60, 60)).toBe(255);
            expect(alphaAt(data, 5, 5)).toBe(0);
        });

        it('refuses a picture on white, and still cuts the next one', async () => {
            const soft = new SoftCutout();

            await expect(soft.removeBackground(await encoded([254, 254, 254]))).rejects.toMatchObject({ code: '409.002.016' });
            await expect(soft.removeBackground(await encoded(PURPLE))).resolves.toMatchObject({ mimeType: 'image/webp' });
        });
    });

    describe('enlarged first', () => {
        /** A stand-in for the model: every pixel of a tile becomes four of the same colour. */
        const doubled: EnlargeModel = async (input, width, height) => {
            const plane = width * height;
            const out = new Float32Array(3 * plane * 4);
            for (let channel = 0; channel < 3; channel++) {
                for (let y = 0; y < height * 2; y++) {
                    for (let x = 0; x < width * 2; x++) out[channel * plane * 4 + y * width * 2 + x] = input[channel * plane + (y >> 1) * width + (x >> 1)];
                }
            }
            return out;
        };
        const here = import.meta.filename;
        const encoded = async (width: number, height: number, background: Colour) => {
            const rgb = Buffer.alloc(width * height * 3);
            for (let pixel = 0; pixel < width * height; pixel++) rgb.set(background, pixel * 3);
            for (let y = Math.round(height / 4); y < Math.round((height * 3) / 4); y++) {
                for (let x = Math.round(width / 4); x < Math.round((width * 3) / 4); x++) rgb.set(BLACK, (y * width + x) * 3);
            }
            return { rgb, bytes: await sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer(), mimeType: 'image/png' };
        };

        it('the enlarger answers a picture two times the size, tile by tile with no seam, and is there only with its model file', async () => {
            // Wider and taller than one tile, so tiles and their margins are stitched.
            const width = 250;
            const height = 230;
            const rgb = Buffer.alloc(width * height * 3);
            for (let pixel = 0; pixel < width * height; pixel++) rgb.set([pixel % 251, (pixel * 7) % 253, (pixel >> 3) % 255], pixel * 3);

            const big = await new Enlarger(here, doubled).enlarge({ rgb, width, height });

            expect([big.width, big.height]).toEqual([500, 460]);
            for (const [x, y] of [[0, 0], [191, 191], [192, 192], [249, 229], [100, 200]]) {
                const from = [...rgb.subarray((y * width + x) * 3, (y * width + x) * 3 + 3)];
                for (const [dx, dy] of [[0, 0], [1, 1]]) {
                    const at = ((y * 2 + dy) * big.width + x * 2 + dx) * 3;
                    expect([...big.rgb.subarray(at, at + 3)]).toEqual(from);
                }
            }
            expect(new Enlarger(here, doubled).available()).toBe(true);
            expect(new Enlarger(here + '.missing', doubled).available()).toBe(false);
        });

        it('a small picture is cut out at two times its size, later; a wide one at its own size, now', async () => {
            const soft = new SoftCutout(new Enlarger(here, doubled));
            const small = await encoded(120, 120, PURPLE);
            const wide = await encoded(1200, 40, PURPLE);

            expect(await soft.plan(small)).toBe('later');
            expect(await soft.plan(wide)).toBe('now');
            const cut = await sharp((await soft.removeBackground(small)).bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            expect([cut.info.width, cut.info.height]).toEqual([240, 240]);
            expect(cut.data[(120 * 240 + 120) * 4 + 3]).toBe(255);
            expect(cut.data[(4 * 240 + 4) * 4 + 3]).toBe(0);
            expect((await sharp((await soft.removeBackground(wide)).bytes).metadata()).width).toBe(1200);
            expect(soft.enlarges()).toBe(true);
        });

        it('without the model file nothing is enlarged', async () => {
            const soft = new SoftCutout(new Enlarger(here + '.missing', doubled));
            const small = await encoded(120, 120, PURPLE);

            expect(await soft.plan(small)).toBe('now');
            expect((await sharp((await soft.removeBackground(small)).bytes).metadata()).width).toBe(120);
            expect(soft.enlarges()).toBe(false);
        });

        it('a picture that is not fit is refused before anything is enlarged', async () => {
            let enlarged = 0;
            const counting: EnlargeModel = async (...tile) => {
                enlarged++;
                return doubled(...tile);
            };
            const soft = new SoftCutout(new Enlarger(here, counting));
            const onWhite = await encoded(120, 120, [254, 254, 254]);

            await expect(soft.plan(onWhite)).rejects.toMatchObject({ code: '409.002.016' });
            await expect(soft.removeBackground(onWhite)).rejects.toMatchObject({ code: '409.002.016' });
            expect(enlarged).toBe(0);
        });
    });

    describe('in the gateway', () => {
        const request = { kind: 'image_cutout' as const, prompt: '', referenceImages: [FAKE_PNG], servedFor: { storyId: 7 } };
        const cut = { bytes: Buffer.from('soft cut-out'), mimeType: 'image/png' };
        const own = { available: () => true, removeBackground: async () => ({ bytes: Buffer.from('own cut-out'), mimeType: 'image/png' }) };

        it('is made when asked for by name, with no call to Venice, and recorded at no cost', async () => {
            const net = recordedFetch([]);
            const { gateway, records } = gatewayUnderTest(net.fetch, { ownCutout: own, softCutout: { removeBackground: async () => cut } });

            const result = await gateway.generateImage({ ...request, cutoutBy: 'soft' });

            expect(net.requests).toEqual([]);
            expect(result).toEqual({ image: cut, model: SOFT_CUTOUT_MODEL, costUsd: 0 });
            expect(records).toEqual([expect.objectContaining({ kind: 'image_cutout', pool: 'image', model: 'soft-key', host: SOFT_CUTOUT_HOST, images: 1, costUsd: 0, storyId: 7 })]);
        });

        it("is never made unasked: a cut-out nobody chose is still the app's own", async () => {
            const net = recordedFetch([]);
            const { gateway } = gatewayUnderTest(net.fetch, { ownCutout: own, softCutout: { removeBackground: async () => cut } });

            const result = await gateway.generateImage(request);

            expect(result.model).toBe('isnet-anime');
        });

        it('a refusal leaves no record and makes no call', async () => {
            const net = recordedFetch([]);
            const { gateway, records } = gatewayUnderTest(net.fetch, {
                softCutout: {
                    removeBackground: async () => {
                        throw Object.assign(new Error('unsuitable'), { code: '409.002.016' });
                    },
                },
            });

            await expect(gateway.generateImage({ ...request, cutoutBy: 'soft' })).rejects.toMatchObject({ code: '409.002.016' });

            expect(net.requests).toEqual([]);
            expect(records).toEqual([]);
        });
    });
});

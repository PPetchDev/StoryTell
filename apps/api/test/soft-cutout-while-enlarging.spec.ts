import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { SLOW_TILE_MS } from './harness/enlarge-models/slow.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface Story {
    id: number;
    characters: { id: number; expressions: { cutoutPath: string | null }[] }[];
}

const WIDTH = 120;
const HEIGHT = 120;

/** A dark square on a flat muted purple: fit for the soft cut-out, and one tile for the enlarger. */
async function drawnOnPurple(): Promise<Buffer> {
    const rgb = Buffer.alloc(WIDTH * HEIGHT * 3);
    for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel++) rgb.set([113, 85, 131], pixel * 3);
    for (let y = 30; y < 90; y++) for (let x = 30; x < 90; x++) rgb.set([24, 24, 28], (y * WIDTH + x) * 3);
    return sharp(rgb, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } }).png().toBuffer();
}

// .scratch/soft-cutout/spec.md, "Enlarged first": on 2026-11-24 the first enlargement on live held
// the API's only thread, and no request at all was answered for eleven minutes.
describe('While a picture is enlarged for its soft cut-out', () => {
    let t: TestApp;

    beforeAll(async () => {
        // The real gateway, so the real soft cut-out, with a model that holds its thread for seconds a tile.
        t = await startTestApp({ modelGateway: 'real', enlargeModelPath: path.join(import.meta.dirname, 'harness', 'enlarge-models', 'slow.ts') });
    });

    afterAll(async () => {
        await t.close();
    });

    it('the API goes on answering other requests, and the cut-out arrives when it is done', async () => {
        const created = await t.http.post('/api/stories').send({ title: 'The Steppe' }).expect(201);
        const story = (await t.http.post(`/api/stories/${created.body.id}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Low.' }).expect(201)).body as Story;
        const expression = `/api/stories/${story.id}/characters/${story.characters[0].id}/expressions/joy`;
        await t.http.put(expression).attach('image', await drawnOnPurple(), 'joy.png').expect(200);

        // One request after another with no pause between them, the one that asks for the cut-out
        // first, so a thread held anywhere in between shows as one request that took that long.
        const asked = Date.now();
        await t.http.post(`${expression}/cutout?with=soft`).expect(201);
        const waits = [Date.now() - asked];
        let cutoutPath: string | null = null;
        while (!cutoutPath && Date.now() - asked < 20_000) {
            const sent = Date.now();
            const now = (await t.http.get(`/api/stories/${story.id}`).expect(200)).body as Story;
            waits.push(Date.now() - sent);
            cutoutPath = now.characters[0].expressions[0].cutoutPath;
        }

        expect(cutoutPath).toMatch(/-joy-[0-9a-f]+-cutout\.webp$/);
        // The enlargement did run all that time: it took at least its one slow tile.
        expect(Date.now() - asked).toBeGreaterThanOrEqual(SLOW_TILE_MS);
        expect(Math.max(...waits)).toBeLessThan(SLOW_TILE_MS / 2);
        // Other requests were answered meanwhile, not one or two.
        expect(waits.length).toBeGreaterThan(5);
        const cut = await sharp(await readFile(path.join(t.imageDir, cutoutPath!))).metadata();
        expect([cut.width, cut.height]).toEqual([WIDTH * 2, HEIGHT * 2]);
    });
});

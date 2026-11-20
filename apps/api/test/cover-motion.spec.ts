import sharp from 'sharp';

import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * A moving Cover (.scratch/cover-motion/spec.md): an animated WebP uploaded as a Cover keeps every
 * frame, and so do the thumbnails Home shows; a still picture's thumbnail is made as before.
 */

/** A small animated WebP: three coloured frames. */
async function animatedWebp(): Promise<Buffer> {
    const frames = await Promise.all(
        ['#c0392b', '#2c3e50', '#f1c40f'].map((background) => sharp({ create: { width: 400, height: 600, channels: 3, background } }).png().toBuffer()),
    );
    return sharp(frames, { join: { animated: true } }).webp({ loop: 0, delay: [200, 200, 200] }).toBuffer();
}


describe('A moving Cover', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    const thumbnail = async (imagePath: string, width: number) =>
        (await t.http.get(`/api/images/${imagePath}?w=${width}`).buffer(true).parse((res, done) => {
                const parts: Buffer[] = [];
                res.on('data', (part: Buffer) => parts.push(part));
                res.on('end', () => done(null, Buffer.concat(parts)));
            }).expect(200)).body as Buffer;

    it('an animated WebP Cover keeps its frames, in the file and in both thumbnails', async () => {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Moonwood' }).expect(201)).body.id as number;
        const bytes = await animatedWebp();
        const cover = (await t.http.put(`/api/stories/${storyId}/cover/upload`).attach('image', bytes, 'cover.webp').expect(200)).body.cover;
        expect(cover.imagePath).toMatch(/\.webp$/);

        const original = (await t.http.get(`/api/images/${cover.imagePath}`).buffer(true).parse((res, done) => {
                const parts: Buffer[] = [];
                res.on('data', (part: Buffer) => parts.push(part));
                res.on('end', () => done(null, Buffer.concat(parts)));
            }).expect(200)).body as Buffer;
        expect((await sharp(original).metadata()).pages).toBe(3);
        for (const width of [320, 640]) {
            const meta = await sharp(await thumbnail(cover.imagePath, width)).metadata();
            expect(meta.pages).toBe(3);
            expect(meta.width).toBeLessThanOrEqual(width);
        }
    });

    it('a still Cover gets a still thumbnail, as before', async () => {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201)).body.id as number;
        const still = await sharp({ create: { width: 800, height: 1200, channels: 3, background: '#1d3a4f' } }).jpeg().toBuffer();
        const cover = (await t.http.put(`/api/stories/${storyId}/cover/upload`).attach('image', still, 'cover.jpg').expect(200)).body.cover;
        const meta = await sharp(await thumbnail(cover.imagePath, 320)).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.pages ?? 1).toBe(1);
        expect(meta.width).toBe(320);
    });
});

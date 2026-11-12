import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import sharp from 'sharp';

import { FAKE_PNG } from '../src/service/model-gateway/fake-model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

describe('Images', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
        await mkdir(path.join(t.imageDir, 'snapshots'), { recursive: true });
        await writeFile(path.join(t.imageDir, 'snapshots', 'one.png'), FAKE_PNG.bytes);
        // A picture bigger than a thumbnail: 1200 by 1800, as a Snapshot is drawn.
        const big = await sharp({ create: { width: 1200, height: 1800, channels: 3, background: '#335577' } }).png().toBuffer();
        await writeFile(path.join(t.imageDir, 'snapshots', 'big.png'), big);
    });

    afterAll(async () => {
        await t.close();
        await rm(`${t.imageDir}-thumbnails`, { recursive: true, force: true });
    });

    it('serves a file by its path relative to the image folder', async () => {
        const response = await t.http
            .get('/api/images/snapshots/one.png')
            .buffer(true)
            .parse((res, done) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => done(null, Buffer.concat(chunks)));
            })
            .expect(200);

        expect(response.headers['content-type']).toBe('image/png');
        expect(Buffer.compare(response.body as Buffer, FAKE_PNG.bytes)).toBe(0);
        // A stored image never changes under its name (audit H33).
        expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    });

    it('answers a WebP thumbnail at a width it offers, made once and kept beside the image folder', async () => {
        const response = await t.http
            .get('/api/images/snapshots/big.png?w=320')
            .buffer(true)
            .parse((res, done) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => done(null, Buffer.concat(chunks)));
            })
            .expect(200);

        expect(response.headers['content-type']).toBe('image/webp');
        expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
        const meta = await sharp(response.body as Buffer).metadata();
        expect(meta.format).toBe('webp');
        expect(meta.width).toBe(320);
        expect(meta.height).toBe(480);
        const kept = path.join(`${t.imageDir}-thumbnails`, '320', 'snapshots', 'big.png.webp');
        expect((await stat(kept)).size).toBe((response.body as Buffer).length);
    });

    it('never enlarges a picture smaller than the thumbnail', async () => {
        const response = await t.http
            .get('/api/images/snapshots/one.png?w=640')
            .buffer(true)
            .parse((res, done) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => done(null, Buffer.concat(chunks)));
            })
            .expect(200);

        expect(response.headers['content-type']).toBe('image/webp');
        expect((await sharp(response.body as Buffer).metadata()).width).toBe(1);
    });

    it('refuses a width it does not make', async () => {
        const response = await t.http.get('/api/images/snapshots/big.png?w=999').expect(400);

        expect(response.body.error.code).toBe('400.002.013');
    });

    it('answers 404 for the thumbnail of a missing file, without a cache header', async () => {
        const response = await t.http.get('/api/images/snapshots/missing.png?w=320').expect(404);

        expect(response.body.error.code).toBe('404.002.001');
        expect(response.headers['cache-control']).toBeUndefined();
    });

    it('answers 404 with an error code for a missing file', async () => {
        const response = await t.http.get('/api/images/snapshots/missing.png').expect(404);

        expect(response.body).toEqual({
            error: { code: '404.002.001', message: 'Image not found.' },
        });
    });

    it.each(['..%2Fsecret.png', 'snapshots/..%2F..%2Fsecret.png', '..%5Csecret.png'])(
        'refuses a path that leaves the image folder: %s',
        async (escapingPath) => {
            const response = await t.http.get(`/api/images/${escapingPath}`).expect(400);

            expect(response.body.error.code).toBe('400.002.002');
        },
    );
});

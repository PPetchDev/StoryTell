import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { FAKE_PNG } from '../src/service/model-gateway/fake-model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

describe('Images', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
        await mkdir(path.join(t.imageDir, 'snapshots'), { recursive: true });
        await writeFile(path.join(t.imageDir, 'snapshots', 'one.png'), FAKE_PNG.bytes);
    });

    afterAll(async () => {
        await t.close();
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

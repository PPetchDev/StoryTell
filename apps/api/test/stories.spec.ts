import { startTestApp, TestApp } from './harness/test-app.js';

describe('Stories', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    it('lists no Stories on a fresh database', async () => {
        const response = await t.http.get('/api/stories').expect(200);

        expect(response.body).toEqual({ stories: [] });
    });
});

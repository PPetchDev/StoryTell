import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/chat-looks/spec.md, "Backdrop": the picture behind a Story's Chats, chosen per Story.
describe('Backdrop', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    async function story(): Promise<{ id: number; backdrop: string }> {
        const { body } = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        return body;
    }

    it('starts at none', async () => {
        const created = await story();

        expect(created.backdrop).toBe('none');
        expect((await t.http.get(`/api/stories/${created.id}`).expect(200)).body.backdrop).toBe('none');
    });

    it('saves each choice and keeps it when another field is saved alone', async () => {
        const created = await story();

        for (const backdrop of ['cover', 'snapshot', 'none', 'snapshot']) {
            const { body } = await t.http.patch(`/api/stories/${created.id}`).send({ backdrop }).expect(200);
            expect(body.backdrop).toBe(backdrop);
        }
        await t.http.patch(`/api/stories/${created.id}`).send({ title: 'Renamed' }).expect(200);
        expect((await t.http.get(`/api/stories/${created.id}`).expect(200)).body).toMatchObject({ title: 'Renamed', backdrop: 'snapshot' });
    });

    it('refuses a value outside none, cover and snapshot, changing nothing', async () => {
        const created = await story();
        await t.http.patch(`/api/stories/${created.id}`).send({ backdrop: 'cover' }).expect(200);

        for (const backdrop of ['reference_image', '', null, 3]) {
            const { body } = await t.http.patch(`/api/stories/${created.id}`).send({ backdrop, title: 'Not saved' }).expect(400);
            expect(body.error.code).toMatch(/^400\./);
        }
        expect((await t.http.get(`/api/stories/${created.id}`).expect(200)).body).toMatchObject({ title: 'The Lighthouse', backdrop: 'cover' });
    });

    it('is copied by Duplicate', async () => {
        const created = await story();
        await t.http.patch(`/api/stories/${created.id}`).send({ backdrop: 'snapshot' }).expect(200);

        const { body: copy } = await t.http.post(`/api/stories/${created.id}/duplicate`).expect(201);

        expect(copy.id).not.toBe(created.id);
        expect(copy.backdrop).toBe('snapshot');
    });
});

import { SESSION_COOKIE, sessionKey, signSession } from '../src/api/auth/session.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountRole } from '../src/model/account/entities/account.entity.js';
import { requestScope } from '../src/model/account/request-scope.js';
import { UsageRecordModelService } from '../src/model/usage-record/usage-record.service.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/accounts/spec.md, ticket 03: People, and what only the Owner may see and change.
const SECRET = 'x'.repeat(40);
const DAY = 24 * 60 * 60 * 1000;

interface Person {
    id: number;
    email: string;
    role: 'owner' | 'member';
    monthlyCapUsd: number | null;
    disabled: boolean;
    spentThisMonthUsd: number;
    signedInBefore: boolean;
}

describe('Accounts: People and Owner-only', () => {
    let t: TestApp;
    let owner: string;
    let accounts: AccountModelService;
    const cookie = (id: number) => `${SESSION_COOKIE}=${signSession(sessionKey(SECRET), id, Date.now() + 60 * DAY)}`;

    beforeAll(async () => {
        t = await startTestApp({ loginPassword: 'lantern-keeper-1890', sessionSecret: SECRET, ownerEmail: 'owner@example.com' });
        accounts = t.app.get(AccountModelService);
        owner = cookie(accounts.owner.id);
    });

    afterAll(async () => {
        await t.close();
    });

    async function people(): Promise<Person[]> {
        return (await t.http.get('/api/people').set('Cookie', owner).expect(200)).body.people as Person[];
    }

    it('lets the Owner add a Member with a Monthly cap, change it, disable and enable, and remove them', async () => {
        const added = await t.http.post('/api/people').set('Cookie', owner).send({ email: ' Rin@Example.com ', monthlyCapUsd: 2 }).expect(201);
        expect(added.body).toMatchObject({ email: 'rin@example.com', role: 'member', monthlyCapUsd: 2, disabled: false, spentThisMonthUsd: 0, signedInBefore: false });
        const id = added.body.id as number;

        const listed = await people();
        expect(listed[0]).toMatchObject({ role: 'owner', email: 'owner@example.com', monthlyCapUsd: null });
        expect(listed.map((person) => person.email)).toContain('rin@example.com');

        const again = await t.http.post('/api/people').set('Cookie', owner).send({ email: 'rin@example.com', monthlyCapUsd: 3 }).expect(409);
        expect(again.body.error.code).toBe('409.010.008');

        await t.http.patch(`/api/people/${id}`).set('Cookie', owner).send({ monthlyCapUsd: 4.5 }).expect(200);
        await t.http.patch(`/api/people/${id}`).set('Cookie', owner).send({ disabled: true }).expect(200);
        expect((await people()).find((person) => person.id === id)).toMatchObject({ monthlyCapUsd: 4.5, disabled: true });
        await t.http.get('/api/stories').set('Cookie', cookie(id)).expect(401);
        await t.http.patch(`/api/people/${id}`).set('Cookie', owner).send({ disabled: false }).expect(200);
        await t.http.get('/api/stories').set('Cookie', cookie(id)).expect(200);

        await t.http.delete(`/api/people/${id}`).set('Cookie', owner).expect(204);
        expect((await people()).map((person) => person.id)).not.toContain(id);
        await t.http.get('/api/stories').set('Cookie', cookie(id)).expect(401);

        // Added again later, the same email comes back as a Member, signed out until they sign in.
        const back = await t.http.post('/api/people').set('Cookie', owner).send({ email: 'rin@example.com', monthlyCapUsd: 1 }).expect(201);
        expect(back.body).toMatchObject({ id, disabled: false, monthlyCapUsd: 1 });
    });

    it('refuses a cap that is negative or missing, and changes to the Owner Account', async () => {
        await t.http.post('/api/people').set('Cookie', owner).send({ email: 'kai@example.com', monthlyCapUsd: -1 }).expect(400);
        await t.http.post('/api/people').set('Cookie', owner).send({ email: 'kai@example.com' }).expect(400);
        await t.http.post('/api/people').set('Cookie', owner).send({ email: 'not-an-email', monthlyCapUsd: 1 }).expect(400);
        const ownerId = accounts.owner.id;
        expect((await t.http.patch(`/api/people/${ownerId}`).set('Cookie', owner).send({ disabled: true }).expect(422)).body.error.code).toBe('422.010.011');
        expect((await t.http.delete(`/api/people/${ownerId}`).set('Cookie', owner).expect(422)).body.error.code).toBe('422.010.011');
        await t.http.patch('/api/people/999999').set('Cookie', owner).send({ monthlyCapUsd: 1 }).expect(404);
    });

    it("shows each person's spend since the first of the month", async () => {
        const { body: mai } = await t.http.post('/api/people').set('Cookie', owner).send({ email: 'mai@example.com', monthlyCapUsd: 3 }).expect(201);
        const usage = t.app.get(UsageRecordModelService);
        const record = { kind: 'turn', pool: 'text', model: 'm', host: 'h', promptTokens: 1, completionTokens: 1, images: null, costUsd: 0.25, storyId: null, chatId: null, characters: null } as never;
        const account = (await accounts.findById(mai.id))!;
        await requestScope.run({ account }, () => usage.record(record));
        await requestScope.run({ account }, () => usage.record(record));
        expect((await people()).find((person) => person.id === mai.id)!.spentThisMonthUsd).toBeCloseTo(0.5);
    });

    it('answers a Member 403 on People, Settings changes and the backup status, but lets them read Settings', async () => {
        const member = await accounts.save({ email: 'nao@example.com', role: AccountRole.Member, monthlyCapUsd: 1 });
        const as = cookie(member.id);
        const refused = await t.http.get('/api/people').set('Cookie', as).expect(403);
        expect(refused.body.error.code).toBe('403.010.007');
        await t.http.post('/api/people').set('Cookie', as).send({ email: 'x@example.com', monthlyCapUsd: 9 }).expect(403);
        await t.http.put('/api/settings').set('Cookie', as).send({ textLowCreditPercent: 50 }).expect(403);
        await t.http.put('/api/settings/samplers/deepseek').set('Cookie', as).send({}).expect(403);
        await t.http.get('/api/backup').set('Cookie', as).expect(403);
        await t.http.get('/api/settings').set('Cookie', as).expect(200);
        await t.http.get('/api/backup').set('Cookie', owner).expect(200);
    });
});

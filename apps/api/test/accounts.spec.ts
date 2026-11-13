import path from 'node:path';

import { SESSION_COOKIE, sessionKey, signSession } from '../src/api/auth/session.js';
import { ConfigError, loadConfig } from '../src/config/app-config.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountRole } from '../src/model/account/entities/account.entity.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/accounts/spec.md, ticket 01: Accounts, the Owner, and a session that names its Account.
const PASSWORD = 'lantern-keeper-1890';
const SECRET = 'x'.repeat(40);
const DAY = 24 * 60 * 60 * 1000;

const base = { PORT: '4001', DATABASE_URL: 'postgres://localhost/test', IMAGE_DIR: path.resolve('/data/storytell/images') };

describe('Accounts: config', () => {
    it('refuses a SESSION_SECRET under 32 characters', () => {
        expect(() => loadConfig({ ...base, SESSION_SECRET: 'too-short' })).toThrow(ConfigError);
        expect(loadConfig({ ...base, SESSION_SECRET: SECRET }).sessionSecret).toBe(SECRET);
    });

    it('needs SESSION_SECRET with SUPABASE_URL, and takes the project URL only', () => {
        expect(() => loadConfig({ ...base, SUPABASE_URL: 'https://abcd.supabase.co' })).toThrow(/SESSION_SECRET/);
        expect(() => loadConfig({ ...base, SUPABASE_URL: 'https://abcd.supabase.co/auth/v1', SESSION_SECRET: SECRET })).toThrow(ConfigError);
        expect(loadConfig({ ...base, SUPABASE_URL: 'https://abcd.supabase.co/', SESSION_SECRET: SECRET }).supabaseUrl).toBe('https://abcd.supabase.co');
    });

    it('lets a public address run with Supabase sign-in alone', () => {
        expect(loadConfig({ ...base, HOST: '0.0.0.0', SUPABASE_URL: 'https://abcd.supabase.co', SESSION_SECRET: SECRET }).host).toBe('0.0.0.0');
    });
});

describe('Accounts: sign-in off', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp({ ownerEmail: '  Owner@Example.com ' });
    });

    afterAll(async () => {
        await t.close();
    });

    it('runs every request as the Owner, named by OWNER_EMAIL', async () => {
        const { body } = await t.http.get('/api/auth/status').expect(200);
        expect(body).toMatchObject({ required: false, signedIn: true, account: { role: 'owner', email: 'owner@example.com' } });
    });
});

describe('Accounts: a session names its Account', () => {
    let t: TestApp;
    let accounts: AccountModelService;

    beforeAll(async () => {
        t = await startTestApp({ loginPassword: PASSWORD, sessionSecret: SECRET });
        accounts = t.app.get(AccountModelService);
    });

    afterAll(async () => {
        await t.close();
    });

    const cookieFor = (accountId: number, expiresAt = Date.now() + 60 * DAY) => `${SESSION_COOKIE}=${signSession(sessionKey(SECRET), accountId, expiresAt)}`;

    it('signs the owner password in as the Owner', async () => {
        const response = await t.http.post('/api/auth/login').send({ password: PASSWORD }).expect(204);
        const cookie = (response.headers['set-cookie'] as unknown as string[]).find((line) => line.startsWith(SESSION_COOKIE))!.split(';')[0];
        expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=v2\\.${accounts.owner.id}\\.`));
        const { body } = await t.http.get('/api/auth/status').set('Cookie', cookie).expect(200);
        expect(body).toMatchObject({ required: true, signedIn: true, account: { id: accounts.owner.id, role: 'owner' } });
    });

    it('takes a Member\'s session, and refuses it at once when the Member is disabled or removed', async () => {
        const member = await accounts.save({ email: 'rin@example.com', role: AccountRole.Member, monthlyCapUsd: 2 });
        const cookie = cookieFor(member.id);
        const { body } = await t.http.get('/api/auth/status').set('Cookie', cookie).expect(200);
        expect(body).toMatchObject({ signedIn: true, account: { id: member.id, role: 'member', email: 'rin@example.com' } });
        await t.http.get('/api/stories').set('Cookie', cookie).expect(200);

        await accounts.save({ ...member, disabled: true });
        expect((await t.http.get('/api/stories').set('Cookie', cookie).expect(401)).body.error.code).toBe('401.010.001');

        await accounts.save({ ...member, disabled: false, removed: true });
        await t.http.get('/api/stories').set('Cookie', cookie).expect(401);
    });

    it('refuses a session for an Account that does not exist, and a v1 cookie', async () => {
        await t.http.get('/api/stories').set('Cookie', cookieFor(999_999)).expect(401);
        const v1 = `${SESSION_COOKIE}=v1.${Date.now() + DAY}.c2lnbmF0dXJl`;
        await t.http.get('/api/stories').set('Cookie', v1).expect(401);
    });

    it('refuses a session signed with another secret', async () => {
        const other = signSession(sessionKey('y'.repeat(40)), accounts.owner.id, Date.now() + DAY);
        await t.http.get('/api/stories').set('Cookie', `${SESSION_COOKIE}=${other}`).expect(401);
    });
});

import path from 'node:path';

import { SESSION_COOKIE, SESSION_RENEW_UNDER_MS, sessionKey, signSession } from '../src/api/auth/session.js';
import { ConfigError, loadConfig } from '../src/config/app-config.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/sign-in/spec.md
const PASSWORD = 'lantern-keeper-1890';
const DAY = 24 * 60 * 60 * 1000;

const base = { PORT: '4001', DATABASE_URL: 'postgres://localhost/test', IMAGE_DIR: path.resolve('/data/storytell/images') };

describe('Sign-in: config', () => {
    it('is off without a password, and listens on loopback by default', () => {
        const config = loadConfig(base);
        expect(config.loginPassword).toBeUndefined();
        expect(config.host).toBe('127.0.0.1');
    });

    it('refuses a password under 12 characters', () => {
        expect(() => loadConfig({ ...base, LOGIN_PASSWORD: 'short-pass1' })).toThrow(ConfigError);
        expect(loadConfig({ ...base, LOGIN_PASSWORD: PASSWORD }).loginPassword).toBe(PASSWORD);
    });

    it('refuses a public address without a password, and allows loopback or a password', () => {
        expect(() => loadConfig({ ...base, HOST: '0.0.0.0' })).toThrow(/LOGIN_PASSWORD/);
        expect(() => loadConfig({ ...base, HOST: '192.168.1.20' })).toThrow(ConfigError);
        for (const host of ['127.0.0.1', '::1', 'localhost']) expect(loadConfig({ ...base, HOST: host }).host).toBe(host);
        expect(loadConfig({ ...base, HOST: '0.0.0.0', LOGIN_PASSWORD: PASSWORD }).host).toBe('0.0.0.0');
    });
});

/** The `name=value` of the session cookie a response set, or undefined. */
function sessionCookie(setCookie: string | string[] | undefined): string | undefined {
    const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    return cookies.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))?.split(';')[0];
}

describe('Sign-in: off', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    it('lets every route through and says none is needed', async () => {
        await t.http.get('/api/stories').expect(200);
        const { body } = await t.http.get('/api/auth/status').expect(200);
        expect(body).toMatchObject({ required: false, signedIn: true });
    });
});

describe('Sign-in: on', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp({ loginPassword: PASSWORD });
    });

    afterAll(async () => {
        await t.close();
    });

    async function signIn(): Promise<string> {
        const response = await t.http.post('/api/auth/login').send({ password: PASSWORD }).expect(204);
        const cookie = sessionCookie(response.headers['set-cookie']);
        expect(cookie).toBeDefined();
        return cookie!;
    }

    it('keeps data, images and audio behind it, but answers health and the status', async () => {
        const refused = await t.http.get('/api/stories').expect(401);
        expect(refused.body.error.code).toBe('401.010.001');
        expect((await t.http.get('/api/images/stories/1/cover.webp').expect(401)).body.error.code).toBe('401.010.001');
        await t.http.get('/api/health').expect(200);
        const { body } = await t.http.get('/api/auth/status').expect(200);
        expect(body).toMatchObject({ required: true, signedIn: false, account: null, methods: { password: true, supabase: null } });
    });

    it('refuses a wrong password without a cookie, and the right one opens every route', async () => {
        const wrong = await t.http.post('/api/auth/login').send({ password: 'not-the-password' }).expect(401);
        expect(wrong.body.error.code).toBe('401.010.002');
        expect(sessionCookie(wrong.headers['set-cookie'])).toBeUndefined();

        const response = await t.http.post('/api/auth/login').send({ password: PASSWORD }).expect(204);
        const header = (response.headers['set-cookie'] as unknown as string[]).find((cookie) => cookie.startsWith(SESSION_COOKIE))!;
        expect(header).toMatch(/HttpOnly/i);
        expect(header).toMatch(/SameSite=Lax/i);
        expect(header).toMatch(/Max-Age=7776000/);
        expect(header).not.toMatch(/Secure/);

        const cookie = sessionCookie(header)!;
        await t.http.get('/api/stories').set('Cookie', cookie).expect(200);
        const { body } = await t.http.get('/api/auth/status').set('Cookie', cookie).expect(200);
        expect(body).toMatchObject({ required: true, signedIn: true });
    });

    it('marks the cookie Secure when the request came over HTTPS through the proxy', async () => {
        const response = await t.http.post('/api/auth/login').set('X-Forwarded-Proto', 'https').send({ password: PASSWORD }).expect(204);
        const header = (response.headers['set-cookie'] as unknown as string[]).find((cookie) => cookie.startsWith(SESSION_COOKIE))!;
        expect(header).toMatch(/Secure/);
    });

    it('refuses a forged, an expired, or another password\'s session', async () => {
        const key = sessionKey(PASSWORD);
        const valid = (await signIn()).split('=')[1];
        const forged = `${valid.slice(0, -2)}${valid.endsWith('AA') ? 'BB' : 'AA'}`;
        const owner = t.app.get(AccountModelService).owner.id;
        const expired = signSession(key, owner, Date.now() - 1_000);
        const otherPassword = signSession(sessionKey('another-password-entirely'), owner, Date.now() + DAY);
        for (const value of [forged, expired, otherPassword, 'garbage']) {
            const refused = await t.http.get('/api/stories').set('Cookie', `${SESSION_COOKIE}=${value}`).expect(401);
            expect(refused.body.error.code).toBe('401.010.001');
        }
    });

    it('renews a session that has under 30 days left, and leaves a fresh one alone', async () => {
        const key = sessionKey(PASSWORD);
        const old = signSession(key, t.app.get(AccountModelService).owner.id, Date.now() + SESSION_RENEW_UNDER_MS - DAY);
        const renewed = await t.http.get('/api/stories').set('Cookie', `${SESSION_COOKIE}=${old}`).expect(200);
        expect(sessionCookie(renewed.headers['set-cookie'])).toBeDefined();

        const cookie = await signIn();
        const fresh = await t.http.get('/api/stories').set('Cookie', cookie).expect(200);
        expect(sessionCookie(fresh.headers['set-cookie'])).toBeUndefined();
    });

    it('takes the valid session when the browser sends a stray cookie of the same name first', async () => {
        const cookie = await signIn();
        await t.http.get('/api/stories').set('Cookie', `${SESSION_COOKIE}=stray; ${cookie}`).expect(200);
    });

    it('signs out by clearing the cookie', async () => {
        const cookie = await signIn();
        const response = await t.http.post('/api/auth/logout').set('Cookie', cookie).expect(204);
        const header = (response.headers['set-cookie'] as unknown as string[]).find((cookie) => cookie.startsWith(SESSION_COOKIE))!;
        expect(header).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    });
});

describe('Sign-in: guessing is slowed down', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp({ loginPassword: PASSWORD });
    });

    afterAll(async () => {
        await t.close();
    });

    it('a right password clears the count; ten wrong ones lock every try, the right one too', async () => {
        for (let i = 0; i < 9; i++) await t.http.post('/api/auth/login').send({ password: `wrong-${i}` }).expect(401);
        await t.http.post('/api/auth/login').send({ password: PASSWORD }).expect(204);

        for (let i = 0; i < 10; i++) await t.http.post('/api/auth/login').send({ password: `wrong-${i}` }).expect(401);
        const locked = await t.http.post('/api/auth/login').send({ password: PASSWORD }).expect(429);
        expect(locked.body.error.code).toBe('429.010.003');
    });
});

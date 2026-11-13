import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';

import { SESSION_COOKIE } from '../src/api/auth/session.js';
import { AccountModelService } from '../src/model/account/account.service.js';
import { AccountRole } from '../src/model/account/entities/account.entity.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/accounts/spec.md, ticket 03: "Supabase sign-in". Supabase is faked at the edge: a key
// pair made here signs the tokens, and its JWKS is served through the harness's fetch.
const SUPABASE = 'https://abcd.supabase.co';
const SECRET = 'x'.repeat(40);

type Keys = Awaited<ReturnType<typeof generateKeyPair>>;

async function jwks(keys: Keys, kid: string): Promise<JWK> {
    return { ...(await exportJWK(keys.publicKey)), kid, alg: 'ES256', use: 'sig' };
}

describe('Accounts: Supabase sign-in', () => {
    let t: TestApp;
    let keys: Keys;
    let foreign: Keys;
    let fetched: string[];

    async function token(claims: Record<string, unknown>, options: { key?: Keys; kid?: string; issuer?: string; audience?: string; expiresIn?: string } = {}): Promise<string> {
        return new SignJWT({ role: 'authenticated', is_anonymous: false, app_metadata: { provider: 'google', providers: ['google'] }, ...claims })
            .setProtectedHeader({ alg: 'ES256', kid: options.kid ?? 'key-1' })
            .setIssuer(options.issuer ?? `${SUPABASE}/auth/v1`)
            .setAudience(options.audience ?? 'authenticated')
            .setIssuedAt()
            .setExpirationTime(options.expiresIn ?? '1h')
            .sign((options.key ?? keys).privateKey);
    }

    beforeAll(async () => {
        keys = await generateKeyPair('ES256');
        foreign = await generateKeyPair('ES256');
        const published = { keys: [await jwks(keys, 'key-1')] };
        fetched = [];
        const authFetch: FetchLike = async (url) => {
            fetched.push(url);
            return new Response(JSON.stringify(published), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };
        t = await startTestApp({ supabaseUrl: SUPABASE, sessionSecret: SECRET, authFetch, ownerEmail: 'owner@example.com' });
    });

    afterAll(async () => {
        await t.close();
    });

    async function signInWith(accessToken: string) {
        return t.http.post('/api/auth/supabase').send({ accessToken });
    }

    function cookieOf(response: { headers: Record<string, unknown> }): string | undefined {
        const lines = (response.headers['set-cookie'] as string[] | undefined) ?? [];
        return lines.find((line) => line.startsWith(`${SESSION_COOKIE}=`))?.split(';')[0];
    }

    it('signs a listed email in, binds its Supabase id, and the session names that Account', async () => {
        const accounts = t.app.get(AccountModelService);
        const rin = await accounts.save({ email: 'rin@example.com', role: AccountRole.Member, monthlyCapUsd: 2 });
        const sub = randomUUID();

        const response = await signInWith(await token({ sub, email: 'Rin@Example.com' }));
        expect(response.status).toBe(204);
        expect(fetched).toContain(`${SUPABASE}/auth/v1/.well-known/jwks.json`);
        const cookie = cookieOf(response)!;
        const { body } = await t.http.get('/api/auth/status').set('Cookie', cookie).expect(200);
        expect(body).toMatchObject({ signedIn: true, account: { id: rin.id, role: 'member' } });
        expect((await accounts.findById(rin.id))!.supabaseId).toBe(sub);

        // Bound: the same Supabase user signs in again, and another one claiming that email does not.
        expect((await signInWith(await token({ sub, email: 'rin@example.com' }))).status).toBe(204);
        const impostor = await signInWith(await token({ sub: randomUUID(), email: 'rin@example.com' }));
        expect(impostor.status).toBe(403);
        expect(impostor.body.error.code).toBe('403.010.005');
    });

    it("refuses an email that isn't on the People list, and a disabled or removed Account", async () => {
        const accounts = t.app.get(AccountModelService);
        const unlisted = await signInWith(await token({ sub: randomUUID(), email: 'stranger@example.com' }));
        expect(unlisted.status).toBe(403);
        expect(unlisted.body.error.code).toBe('403.010.005');
        expect(cookieOf(unlisted)).toBeUndefined();

        await accounts.save({ email: 'kai@example.com', role: AccountRole.Member, monthlyCapUsd: 1, disabled: true });
        const disabled = await signInWith(await token({ sub: randomUUID(), email: 'kai@example.com' }));
        expect(disabled.status).toBe(403);
        expect(disabled.body.error.code).toBe('403.010.006');

        await accounts.save({ email: 'gone@example.com', role: AccountRole.Member, monthlyCapUsd: 1, removed: true });
        expect((await signInWith(await token({ sub: randomUUID(), email: 'gone@example.com' }))).body.error.code).toBe('403.010.005');
    });

    it('refuses a token that is expired, from another issuer or audience, anonymous, not a user, or signed by another key', async () => {
        const accounts = t.app.get(AccountModelService);
        await accounts.save({ email: 'mai@example.com', role: AccountRole.Member, monthlyCapUsd: 1 });
        const claims = { sub: randomUUID(), email: 'mai@example.com' };
        const bad = [
            await token(claims, { expiresIn: '-1m' }),
            await token(claims, { issuer: 'https://evil.supabase.co/auth/v1' }),
            await token(claims, { audience: 'anon' }),
            await token({ ...claims, is_anonymous: true }),
            await token({ ...claims, role: 'anon' }),
            await token(claims, { key: foreign }),
            await token(claims, { key: foreign, kid: 'key-2' }),
            'not.a.token',
        ];
        for (const accessToken of bad) {
            const refused = await signInWith(accessToken);
            expect({ status: refused.status, code: refused.body.error?.code }).toEqual({ status: 401, code: '401.010.004' });
            expect(cookieOf(refused)).toBeUndefined();
        }
    });

    it("reads the keys again for an unknown key id at most once a minute, so tokens can't make it fetch on every request", async () => {
        const before = fetched.length;
        for (let i = 0; i < 5; i++) {
            const refused = await signInWith(await token({ sub: randomUUID(), email: 'mai@example.com' }, { key: foreign, kid: `unknown-${i}` }));
            expect(refused.status).toBe(401);
        }
        expect(fetched.length - before).toBeLessThanOrEqual(1);
    });

    it('binds an email + password sign-in only once the Owner says Supabase confirms emails', async () => {
        const accounts = t.app.get(AccountModelService);
        await accounts.save({ email: 'pat@example.com', role: AccountRole.Member, monthlyCapUsd: 1 });
        const byPassword = { app_metadata: { provider: 'email', providers: ['email'] } };
        // With "Confirm email" off, anyone could make a Supabase user with Pat's email.
        const refused = await signInWith(await token({ sub: randomUUID(), email: 'pat@example.com', ...byPassword }));
        expect(refused.status).toBe(403);
        expect(refused.body.error.code).toBe('403.010.014');
        // A Google identity proves the email: Google checked it.
        const linked = { app_metadata: { provider: 'email', providers: ['email', 'google'] } };
        expect((await signInWith(await token({ sub: randomUUID(), email: 'pat@example.com', ...linked }))).status).toBe(204);
    });

    it('signs the Owner in too, by the owner email', async () => {
        const accounts = t.app.get(AccountModelService);
        const response = await signInWith(await token({ sub: randomUUID(), email: accounts.owner.email }));
        expect(response.status).toBe(204);
        const { body } = await t.http.get('/api/auth/status').set('Cookie', cookieOf(response)!).expect(200);
        expect(body.account).toMatchObject({ id: accounts.owner.id, role: 'owner' });
    });

    it('has no owner password while LOGIN_PASSWORD is unset', async () => {
        const refused = await t.http.post('/api/auth/login').send({ password: 'anything-at-all-here' });
        expect(refused.status).toBe(401);
    });
});

describe('Accounts: Supabase sign-in not set up', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp({ loginPassword: 'lantern-keeper-1890' });
    });

    afterAll(async () => {
        await t.close();
    });

    it('answers that it is not set up', async () => {
        const response = await t.http.post('/api/auth/supabase').send({ accessToken: 'whatever' }).expect(404);
        expect(response.body.error.code).toBe('404.010.010');
        const { body } = await t.http.get('/api/auth/status').expect(200);
        expect(body).toMatchObject({ methods: { password: true, supabase: null } });
    });
});

describe('Accounts: the Owner is bound by email only when OWNER_EMAIL names it', () => {
    let t: TestApp;
    let keys: Keys;

    beforeAll(async () => {
        keys = await generateKeyPair('ES256');
        const published = { keys: [await jwks(keys, 'key-1')] };
        const authFetch: FetchLike = async () => new Response(JSON.stringify(published), { status: 200 });
        t = await startTestApp({ supabaseUrl: SUPABASE, sessionSecret: SECRET, authFetch });
    });

    afterAll(async () => {
        await t.close();
    });

    it('refuses a Supabase user claiming the placeholder Owner email', async () => {
        const owner = t.app.get(AccountModelService).owner;
        const claim = await new SignJWT({ role: 'authenticated', is_anonymous: false, email: owner.email, sub: randomUUID() })
            .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
            .setIssuer(`${SUPABASE}/auth/v1`)
            .setAudience('authenticated')
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(keys.privateKey);
        const refused = await t.http.post('/api/auth/supabase').send({ accessToken: claim });
        expect(refused.status).toBe(403);
        expect(refused.body.error.code).toBe('403.010.005');
        expect((await t.app.get(AccountModelService).findById(owner.id))!.supabaseId).toBeNull();
    });

    it("keeps the Owner's email when OWNER_EMAIL belongs to another Account already, rather than failing to start", async () => {
        const accounts = t.app.get(AccountModelService);
        await accounts.save({ email: 'taken@example.com', role: AccountRole.Member, monthlyCapUsd: 1, removed: true });
        const before = accounts.owner.email;
        await accounts.nameOwner('taken@example.com');
        expect((await accounts.findById(accounts.owner.id))!.email).toBe(before);
        await accounts.nameOwner('Fresh@Example.com');
        expect((await accounts.findById(accounts.owner.id))!.email).toBe('fresh@example.com');
    });
});

describe('Accounts: email + password binding when Supabase confirms emails', () => {
    let t: TestApp;
    let keys: Keys;

    beforeAll(async () => {
        keys = await generateKeyPair('ES256');
        const published = { keys: [await jwks(keys, 'key-1')] };
        const authFetch: FetchLike = async () => new Response(JSON.stringify(published), { status: 200 });
        t = await startTestApp({ supabaseUrl: SUPABASE, sessionSecret: SECRET, authFetch, supabaseEmailsConfirmed: true });
    });

    afterAll(async () => {
        await t.close();
    });

    it('binds a listed email signed in with a password', async () => {
        await t.app.get(AccountModelService).save({ email: 'sam@example.com', role: AccountRole.Member, monthlyCapUsd: 1 });
        const claim = await new SignJWT({ role: 'authenticated', is_anonymous: false, email: 'sam@example.com', sub: randomUUID(), app_metadata: { provider: 'email', providers: ['email'] } })
            .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
            .setIssuer(`${SUPABASE}/auth/v1`)
            .setAudience('authenticated')
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(keys.privateKey);
        expect((await t.http.post('/api/auth/supabase').send({ accessToken: claim })).status).toBe(204);
    });
});

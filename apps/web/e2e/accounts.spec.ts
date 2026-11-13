import { expect, test } from '@playwright/test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { startApi, stopApi } from './harness/api-server';

// .scratch/accounts/spec.md: "e2e". The shared API restarts with Supabase sign-in for this file only.
// A local server publishes a test key as the Supabase JWKS; the test signs Members' tokens with it,
// so no test reaches Supabase.
const OWNER_PASSWORD = 'lantern-keeper-1890';
let jwksServer: Server;
let supabaseUrl: string;
let keys: Awaited<ReturnType<typeof generateKeyPair>>;

async function memberToken(email: string): Promise<string> {
    return new SignJWT({ role: 'authenticated', is_anonymous: false, email, app_metadata: { provider: 'google', providers: ['google'] } })
        .setProtectedHeader({ alg: 'ES256', kid: 'e2e-key' })
        .setSubject(randomUUID())
        .setIssuer(`${supabaseUrl}/auth/v1`)
        .setAudience('authenticated')
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(keys.privateKey);
}

test.beforeAll(async () => {
    keys = await generateKeyPair('ES256');
    const jwks = JSON.stringify({ keys: [{ ...(await exportJWK(keys.publicKey)), kid: 'e2e-key', alg: 'ES256', use: 'sig' }] });
    jwksServer = createServer((request, response) => {
        if (request.url === '/auth/v1/.well-known/jwks.json') response.writeHead(200, { 'Content-Type': 'application/json' }).end(jwks);
        else response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
    supabaseUrl = `http://127.0.0.1:${(jwksServer.address() as AddressInfo).port}`;
    await stopApi();
    await startApi({
        LOGIN_PASSWORD: OWNER_PASSWORD,
        SESSION_SECRET: 'e2e-session-secret-'.repeat(3),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_ANON_KEY: 'e2e-anon-key',
        OWNER_EMAIL: 'owner@example.com',
    });
});

test.afterAll(async () => {
    // Back to the plain API for the files after this one.
    await stopApi();
    await startApi();
    await new Promise((resolve) => jwksServer.close(resolve));
});

test('the Owner adds a Member, who signs in to an empty Story list and never sees the Owner\'s Stories or settings', async ({ page, browser }) => {
    // The sign-in screen offers Google and email first, the owner password behind a link.
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await page.getByRole('button', { name: 'Owner password' }).click();
    await page.getByLabel('Owner password').fill(OWNER_PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();

    const created = await page.request.post('/api/stories', { data: { title: 'Owner Secret Tale' } });
    expect(created.ok()).toBe(true);
    const ownerStoryId = (await created.json()).id as number;
    // The files after this one expect the Owner's Story list empty.
    try {

        const people = page.getByRole('list', { name: 'People' });
        await expect(people.getByRole('listitem', { name: 'owner@example.com' })).toContainText('Owner');
        const addForm = page.getByRole('form', { name: 'Add a person' });
        await addForm.getByLabel('Email').fill('rin@example.com');
        await addForm.getByLabel('Cap (USD)').fill('2.50');
        await addForm.getByRole('button', { name: 'Add' }).click();
        await expect(people.getByRole('listitem', { name: 'rin@example.com' })).toContainText('Member, not signed in yet');
        await expect(people.getByRole('listitem', { name: 'rin@example.com' })).toContainText('$2.50');

        // The Member, on a device of their own, signs in with a Supabase token.
        const memberContext = await browser.newContext();
        const member = await memberContext.newPage();
        const signedIn = await memberContext.request.post('/api/auth/supabase', { data: { accessToken: await memberToken('rin@example.com') } });
        expect(signedIn.status()).toBe(204);

        await member.goto('/');
        await expect(member.getByText('No Stories yet.')).toBeVisible();
        await expect(member.getByText('Owner Secret Tale')).toHaveCount(0);
        expect((await memberContext.request.get(`/api/stories/${ownerStoryId}`)).status()).toBe(404);

        await member.goto('/settings');
        await expect(member.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
        await expect(member.getByText('As rin@example.com.')).toBeVisible();
        await expect(member.getByRole('heading', { name: 'Models' })).toHaveCount(0);
        await expect(member.getByRole('heading', { name: 'People' })).toHaveCount(0);
        await expect(member.getByRole('heading', { name: 'Credit' })).toHaveCount(0);

        await member.goto('/usage');
        await expect(member.getByRole('heading', { name: 'Your Monthly cap' })).toBeVisible();
        await expect(member.getByText('$0.00 of $2.50')).toBeVisible();
        await expect(member.getByText('Remaining credit')).toHaveCount(0);

        // Back on the Owner's device, the Member shows as signed in.
        await page.reload();
        await expect(people.getByRole('listitem', { name: 'rin@example.com' })).toContainText(/Member ·/);
        await memberContext.close();
    } finally {
        await page.request.delete(`/api/stories/${ownerStoryId}`);
    }
});

test('an email not on the People list is told so', async ({ browser }) => {
    const context = await browser.newContext();
    const refused = await context.request.post('/api/auth/supabase', { data: { accessToken: await memberToken('stranger@example.com') } });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error.message).toContain("isn't on this Storytell's People list");
    await context.close();
});

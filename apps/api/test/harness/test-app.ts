import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent.js';
import { inject } from 'vitest';

import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { FakeModelGateway } from '../../src/service/model-gateway/fake-model-gateway.js';
import { ModelGateway } from '../../src/service/model-gateway/model-gateway.js';

export interface TestApp {
    app: INestApplication;
    /** Supertest agent bound to the app. Paths include the `/api` prefix. */
    http: TestAgent;
    /** The app's Model Gateway: script replies on it and inspect the calls it got. */
    gateway: FakeModelGateway;
    /** This app's temporary image folder. */
    imageDir: string;
    /** Connection URL of this app's own database. */
    databaseUrl: string;
    close(): Promise<void>;
}

async function admin(sql: string): Promise<void> {
    const client = new pg.Client({ connectionString: inject('postgresAdminUrl') });
    await client.connect();
    try {
        await client.query(sql);
    } finally {
        await client.end();
    }
}

/**
 * Boots the real NestJS app against a fresh, migrated database and an empty temporary image
 * folder, with only the Model Gateway faked. Call it in `beforeAll` or `beforeEach`, and
 * `close()` it afterwards.
 */
export async function startTestApp(): Promise<TestApp> {
    const database = `test_${randomBytes(6).toString('hex')}`;
    await admin(`CREATE DATABASE "${database}" TEMPLATE "${inject('templateDatabase')}"`);
    const databaseUrl = inject('postgresAdminUrl').replace(/\/postgres$/, `/${database}`);
    const imageDir = await mkdtemp(path.join(os.tmpdir(), 'storytell-images-'));

    const moduleRef = await Test.createTestingModule({
        imports: [
            AppModule.forRoot({
                port: 0,
                databaseUrl,
                imageDir,
                modelGateway: 'fake',
                providerKeys: { openRouter: undefined, runware: undefined },
            }),
        ],
    }).compile();
    const app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();

    return {
        app,
        http: request(app.getHttpServer()),
        gateway: app.get(ModelGateway) as FakeModelGateway,
        imageDir,
        databaseUrl,
        close: async () => {
            await app.close();
            await admin(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
            await rm(imageDir, { recursive: true, force: true });
        },
    };
}

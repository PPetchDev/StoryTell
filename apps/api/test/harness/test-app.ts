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
import { ProviderKeys } from '../../src/config/app-config.js';
import { FakeModelGateway } from '../../src/service/model-gateway/fake-model-gateway.js';
import { GATEWAY_FETCH } from '../../src/service/model-gateway/model-gateway.module.js';
import { ModelGateway } from '../../src/service/model-gateway/model-gateway.js';
import { FetchLike } from '../../src/service/model-gateway/real/http.js';
import { PAGE_FETCH } from '../../src/service/page-fetch/page-fetch.module.js';

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

export interface TestAppOptions {
    /**
     * `real` runs the real gateway against `fetch`, which must then replay provider
     * responses; `gateway` is not a FakeModelGateway in that case. Default: the fake.
     */
    modelGateway?: 'fake' | 'real';
    fetch?: FetchLike;
    /** What a web page fetch for a Document goes through. Default: a fetcher that fails every address, so no test opens a socket. */
    pageFetch?: FetchLike;
    providerKeys?: Partial<ProviderKeys>;
    /** How long a send waits for a pending background call. Default 1.5 s. */
    backgroundWaitMs?: number;
    /** How long a failed background call waits before its one automatic retry. Default 0. */
    backgroundRetryMs?: number;
    /** The backup job's status file. Default: unset, as in dev. */
    backupStatusFile?: string;
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
export async function startTestApp(options: TestAppOptions = {}): Promise<TestApp> {
    const database = `test_${randomBytes(6).toString('hex')}`;
    await admin(`CREATE DATABASE "${database}" TEMPLATE "${inject('templateDatabase')}"`);
    const databaseUrl = inject('postgresAdminUrl').replace(/\/postgres$/, `/${database}`);
    const imageDir = await mkdtemp(path.join(os.tmpdir(), 'storytell-images-'));

    const noNetwork: FetchLike = async (url) => {
        throw new Error(`Test app has no network, but the gateway tried ${url}`);
    };
    const moduleRef = await Test.createTestingModule({
        imports: [
            AppModule.forRoot({
                port: 0,
                databaseUrl,
                imageDir,
                modelGateway: options.modelGateway ?? 'fake',
                // Short, so a test of the "still saving" path does not sit through the real wait.
                backgroundWaitMs: options.backgroundWaitMs ?? 1_500,
                backgroundRetryMs: options.backgroundRetryMs ?? 0,
                backupStatusFile: options.backupStatusFile,
                providerKeys: {
                    openRouter: undefined,
                    venice: undefined,
                    veniceAdmin: undefined,
                    ...options.providerKeys,
                },
            }),
        ],
    })
        .overrideProvider(GATEWAY_FETCH)
        .useValue(options.fetch ?? noNetwork)
        .overrideProvider(PAGE_FETCH)
        .useValue(options.pageFetch ?? noNetwork)
        .compile();
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

import { Global, Module } from '@nestjs/common';

import { AppConfig } from '../../config/app-config.js';
import { FetchLike } from '../model-gateway/real/http.js';
import { FakePageFetcher } from './fake-page-fetcher.js';

/**
 * The `fetch` a web page for a Document goes through (.scratch/documents/spec.md: "Files and web
 * pages"), injected as the Model Gateway's is: Node's own `fetch`, or with the fake model gateway
 * the scripted fake, so e2e never reaches the network. API tests override it.
 */
export const PAGE_FETCH = Symbol('PAGE_FETCH');

@Global()
@Module({
    providers: [
        { provide: FakePageFetcher, useValue: new FakePageFetcher() },
        {
            provide: PAGE_FETCH,
            inject: [AppConfig, FakePageFetcher],
            useFactory: (config: AppConfig, fake: FakePageFetcher): FetchLike =>
                config.modelGateway === 'fake' ? fake.fetch : (globalThis.fetch.bind(globalThis) as FetchLike),
        },
    ],
    exports: [PAGE_FETCH, FakePageFetcher],
})
export class PageFetchModule {}

import { DynamicModule, Global, Module } from '@nestjs/common';

import { AppConfig } from '../../config/app-config.js';
import { SettingsModelModule } from '../../model/settings/settings.module.js';
import { SettingsModelService } from '../../model/settings/settings.service.js';
import { UsageRecordModelModule } from '../../model/usage-record/usage-record.module.js';
import { UsageRecordModelService } from '../../model/usage-record/usage-record.service.js';
import { AccountModelService } from '../../model/account/account.service.js';
import { CappedModelGateway } from './capped-model-gateway.js';
import { FakeModelGateway } from './fake-model-gateway.js';
import { SpendCap } from './spend-cap.js';
import { ModelGateway } from './model-gateway.js';
import { FetchLike } from './real/http.js';
import { OpenRouterClient } from './real/openrouter-client.js';
import { RealModelGateway } from './real/real-model-gateway.js';
import { VeniceClient } from './real/venice-client.js';

/** The `fetch` the real gateway uses. A test app overrides it to replay recorded responses. */
export const GATEWAY_FETCH = Symbol('GATEWAY_FETCH');

@Global()
@Module({})
export class ModelGatewayModule {
    static forRoot(): DynamicModule {
        return {
            module: ModelGatewayModule,
            imports: [SettingsModelModule, UsageRecordModelModule],
            providers: [
                { provide: GATEWAY_FETCH, useValue: globalThis.fetch.bind(globalThis) as FetchLike },
                {
                    provide: SpendCap,
                    inject: [AccountModelService, UsageRecordModelService],
                    useFactory: (accounts: AccountModelService, usage: UsageRecordModelService) => new SpendCap(accounts, usage),
                },
                {
                    provide: ModelGateway,
                    inject: [AppConfig, GATEWAY_FETCH, SettingsModelService, UsageRecordModelService, SpendCap],
                    useFactory: (
                        config: AppConfig,
                        fetchImpl: FetchLike,
                        settings: SettingsModelService,
                        usage: UsageRecordModelService,
                        cap: SpendCap,
                    ): ModelGateway => new CappedModelGateway(gatewayFor(config, fetchImpl, settings, usage), cap),
                },
            ],
            exports: [ModelGateway, SpendCap],
        };
    }
}

/** The real gateway, or the scripted fake for tests and e2e. */
function gatewayFor(config: AppConfig, fetchImpl: FetchLike, settings: SettingsModelService, usage: UsageRecordModelService): ModelGateway {
    if (config.modelGateway === 'fake') return new FakeModelGateway();
    const keys = config.providerKeys;
    return new RealModelGateway({
        openRouter: new OpenRouterClient(keys.openRouter, fetchImpl),
        venice: new VeniceClient(keys.venice, keys.veniceAdmin, fetchImpl),
        settings: {
            current: async () => {
                const current = await settings.get();
                return {
                    playModel: current.playModel,
                    imageModel: current.imageModel,
                    snapshotSize: current.snapshotSize,
                    samplers: current.samplers,
                };
            },
        },
        usage: { record: (record) => usage.record(record) },
    });
}

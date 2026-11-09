import { DynamicModule, Module } from '@nestjs/common';

import { ApiModule } from './api/api.module.js';
import { AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { ModelGatewayModule } from './service/model-gateway/model-gateway.module.js';
import { PageFetchModule } from './service/page-fetch/page-fetch.module.js';
import { DbModule } from './store/db/db.module.js';
import { FakeGatewayControlController } from './testing/fake-gateway-control.controller.js';

@Module({})
export class AppModule {
    static forRoot(config: AppConfig): DynamicModule {
        return {
            module: AppModule,
            imports: [
                ConfigModule.forRoot(config),
                DbModule,
                ModelGatewayModule.forRoot(),
                PageFetchModule,
                ApiModule,
            ],
            controllers: config.modelGateway === 'fake' ? [FakeGatewayControlController] : [],
        };
    }
}

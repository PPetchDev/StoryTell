import { DynamicModule, Module } from '@nestjs/common';

import { ApiModule } from './api/api.module.js';
import { AccountModelModule } from './model/account/account.module.js';
import { AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { DiceModule } from './service/dice/dice.js';
import { ModelGatewayModule } from './service/model-gateway/model-gateway.module.js';
import { PageFetchModule } from './service/page-fetch/page-fetch.module.js';
import { DbModule } from './store/db/db.module.js';
import { FakeGatewayControlController } from './testing/fake-gateway-control.controller.js';
import { FakePushControlController } from './testing/fake-push-control.controller.js';
import { FakeReachOutControlController } from './testing/fake-reach-out-control.controller.js';
import { ReachOutManagerModule } from './manager/reach-out/reach-out.module.js';
import { PushAlertsManagerModule } from './manager/push/push.module.js';
import { PushSenderModule } from './service/push/push-sender.module.js';

@Module({})
export class AppModule {
    static forRoot(config: AppConfig): DynamicModule {
        return {
            module: AppModule,
            imports: [
                ConfigModule.forRoot(config),
                DbModule,
                AccountModelModule,
                ModelGatewayModule.forRoot(),
                DiceModule,
                PageFetchModule,
                PushSenderModule,
                PushAlertsManagerModule,
                ApiModule,
                // For the testing route's scheduler; the API module brings it in too.
                ReachOutManagerModule,
            ],
            controllers: config.modelGateway === 'fake' ? [FakeGatewayControlController, FakePushControlController, FakeReachOutControlController] : [],
        };
    }
}

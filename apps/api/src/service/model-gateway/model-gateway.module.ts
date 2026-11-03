import { DynamicModule, Global, Module } from '@nestjs/common';

import { ModelGatewayMode } from '../../config/app-config.js';
import { FakeModelGateway } from './fake-model-gateway.js';
import { ModelGateway } from './model-gateway.js';
import { UnavailableModelGateway } from './unavailable-model-gateway.js';

@Global()
@Module({})
export class ModelGatewayModule {
    static forRoot(mode: ModelGatewayMode): DynamicModule {
        return {
            module: ModelGatewayModule,
            providers: [
                {
                    provide: ModelGateway,
                    useClass: mode === 'fake' ? FakeModelGateway : UnavailableModelGateway,
                },
            ],
            exports: [ModelGateway],
        };
    }
}

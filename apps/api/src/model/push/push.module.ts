import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PushSubscriptionEntity } from './entities/push-subscription.entity.js';
import { PushSubscriptionModelService } from './push.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([PushSubscriptionEntity])],
    providers: [PushSubscriptionModelService],
    exports: [PushSubscriptionModelService],
})
export class PushSubscriptionModelModule {}

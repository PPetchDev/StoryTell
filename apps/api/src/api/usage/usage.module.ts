import { Module } from '@nestjs/common';

import { UsageManagerModule } from '../../manager/usage/usage.module.js';
import { ReplyCostApiController } from './reply-cost.controller.js';
import { UsageApiController } from './usage.controller.js';

@Module({
    imports: [UsageManagerModule],
    controllers: [UsageApiController, ReplyCostApiController],
})
export class UsageApiModule {}

import { Module } from '@nestjs/common';

import { UsageManagerModule } from '../../manager/usage/usage.module.js';
import { UsageApiController } from './usage.controller.js';

@Module({
    imports: [UsageManagerModule],
    controllers: [UsageApiController],
})
export class UsageApiModule {}

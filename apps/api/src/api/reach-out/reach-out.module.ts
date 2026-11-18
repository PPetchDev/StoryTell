import { Module } from '@nestjs/common';

import { ReachOutManagerModule } from '../../manager/reach-out/reach-out.module.js';
import { ReachOutApiController } from './reach-out.controller.js';

@Module({
    imports: [ReachOutManagerModule],
    controllers: [ReachOutApiController],
})
export class ReachOutApiModule {}

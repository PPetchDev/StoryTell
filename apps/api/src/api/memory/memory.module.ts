import { Module } from '@nestjs/common';

import { ChatManagerModule } from '../../manager/chat/chat.module.js';
import { BeliefApiController } from './belief.controller.js';
import { MemoryApiController } from './memory.controller.js';

@Module({
    imports: [ChatManagerModule],
    controllers: [MemoryApiController, BeliefApiController],
})
export class MemoryApiModule {}

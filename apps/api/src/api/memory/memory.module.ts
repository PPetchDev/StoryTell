import { Module } from '@nestjs/common';

import { ChatManagerModule } from '../../manager/chat/chat.module.js';
import { MemoryApiController } from './memory.controller.js';

@Module({
    imports: [ChatManagerModule],
    controllers: [MemoryApiController],
})
export class MemoryApiModule {}

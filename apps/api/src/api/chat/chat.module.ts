import { Module } from '@nestjs/common';

import { ChatManagerModule } from '../../manager/chat/chat.module.js';
import { ChatApiController } from './chat.controller.js';

@Module({
    imports: [ChatManagerModule],
    controllers: [ChatApiController],
})
export class ChatApiModule {}

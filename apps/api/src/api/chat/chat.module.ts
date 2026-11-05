import { Module } from '@nestjs/common';

import { ChatManagerModule } from '../../manager/chat/chat.module.js';
import { ChatTranscriptApiController } from './chat-transcript.controller.js';
import { ChatApiController } from './chat.controller.js';

@Module({
    imports: [ChatManagerModule],
    controllers: [ChatApiController, ChatTranscriptApiController],
})
export class ChatApiModule {}

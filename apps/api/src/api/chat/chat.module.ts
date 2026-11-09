import { Module } from '@nestjs/common';

import { ChatManagerModule } from '../../manager/chat/chat.module.js';
import { ReadAloudManagerModule } from '../../manager/read-aloud/read-aloud.module.js';
import { ChatTranscriptApiController } from './chat-transcript.controller.js';
import { ChatApiController } from './chat.controller.js';
import { DictationApiController } from './dictation.controller.js';
import { ReadAloudApiController } from './read-aloud.controller.js';

@Module({
    imports: [ChatManagerModule, ReadAloudManagerModule],
    controllers: [ChatApiController, ChatTranscriptApiController, DictationApiController, ReadAloudApiController],
})
export class ChatApiModule {}

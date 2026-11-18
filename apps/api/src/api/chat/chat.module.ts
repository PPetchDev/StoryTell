import { Module } from '@nestjs/common';

import { ChatManagerModule } from '../../manager/chat/chat.module.js';
import { ReadAloudManagerModule } from '../../manager/read-aloud/read-aloud.module.js';
import { ChatSearchManagerModule } from '../../manager/chat/search/chat-search.module.js';
import { ChatSearchApiController } from './chat-search.controller.js';
import { ChatTranscriptApiController } from './chat-transcript.controller.js';
import { ChatApiController } from './chat.controller.js';
import { DictationApiController } from './dictation.controller.js';
import { LiveTurns } from './live-turns.js';
import { ReadAloudApiController } from './read-aloud.controller.js';
import { StopWatchInterceptor } from './stop-watch.interceptor.js';
import { WatchApiController } from './watch.controller.js';
import { WatchRuns } from './watch-runs.js';

@Module({
    imports: [ChatManagerModule, ReadAloudManagerModule, ChatSearchManagerModule],
    controllers: [ChatApiController, ChatTranscriptApiController, ChatSearchApiController, DictationApiController, ReadAloudApiController, WatchApiController],
    providers: [LiveTurns, WatchRuns, StopWatchInterceptor],
})
export class ChatApiModule {}

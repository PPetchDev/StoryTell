import { Module } from '@nestjs/common';

import { ChatModelModule } from '../../model/chat/chat.module.js';
import { ReplaceRuleModelModule } from '../../model/replace-rule/replace-rule.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { SpeechStoreModule } from '../../store/speech/speech-store.module.js';
import { ReadAloudManagerService } from './read-aloud.service.js';

/** Read aloud's play queue and audio cache. Chat and Story writes call its sweep and Branch copy. */
@Module({
    imports: [StoryModelModule, ChatModelModule, ReplaceRuleModelModule, SpeechStoreModule],
    providers: [ReadAloudManagerService],
    exports: [ReadAloudManagerService],
})
export class ReadAloudManagerModule {}

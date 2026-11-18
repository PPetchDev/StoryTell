import { Module } from '@nestjs/common';

import { ChatModelModule } from '../../../model/chat/chat.module.js';
import { ReplaceRuleModelModule } from '../../../model/replace-rule/replace-rule.module.js';
import { StoryModelModule } from '../../../model/story/story.module.js';
import { ChatSearchManagerService } from './chat-search.service.js';

/** Search within a Chat and its Bookmarks (.scratch/chat-search/spec.md). */
@Module({
    imports: [ChatModelModule, StoryModelModule, ReplaceRuleModelModule],
    providers: [ChatSearchManagerService],
    exports: [ChatSearchManagerService],
})
export class ChatSearchManagerModule {}

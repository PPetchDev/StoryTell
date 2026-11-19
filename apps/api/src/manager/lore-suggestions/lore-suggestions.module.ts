import { Module } from '@nestjs/common';

import { ChatModelModule } from '../../model/chat/chat.module.js';
import { LedgerModelModule } from '../../model/ledger/ledger.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { LoreSuggestionsManagerService } from './lore-suggestions.service.js';

@Module({
    imports: [ChatModelModule, StoryModelModule, LedgerModelModule],
    providers: [LoreSuggestionsManagerService],
    exports: [LoreSuggestionsManagerService],
})
export class LoreSuggestionsManagerModule {}

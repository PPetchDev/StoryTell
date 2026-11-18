import { Module } from '@nestjs/common';

import { ChatModelModule } from '../../model/chat/chat.module.js';
import { LedgerModelModule } from '../../model/ledger/ledger.module.js';
import { RecapModelModule } from '../../model/recap/recap.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { RecapManagerService } from './recap.service.js';

@Module({
    imports: [ChatModelModule, StoryModelModule, LedgerModelModule, RecapModelModule],
    providers: [RecapManagerService],
    exports: [RecapManagerService],
})
export class RecapManagerModule {}

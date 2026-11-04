import { Module } from '@nestjs/common';

import { ChatModelModule } from '../../model/chat/chat.module.js';
import { LedgerModelModule } from '../../model/ledger/ledger.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { StoryManagerService } from './story.service.js';

@Module({
    imports: [StoryModelModule, ChatModelModule, LedgerModelModule, ImageStoreModule],
    providers: [StoryManagerService],
    exports: [StoryManagerService],
})
export class StoryManagerModule {}

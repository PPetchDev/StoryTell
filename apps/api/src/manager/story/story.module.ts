import { Module } from '@nestjs/common';

import { DocumentModelModule } from '../../model/document/document.module.js';
import { ChatModelModule } from '../../model/chat/chat.module.js';
import { LedgerModelModule } from '../../model/ledger/ledger.module.js';
import { SnapshotModelModule } from '../../model/snapshot/snapshot.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { ReadAloudManagerModule } from '../read-aloud/read-aloud.module.js';
import { VoiceManagerModule } from '../voice/voice.module.js';
import { StoryManagerService } from './story.service.js';

@Module({
    imports: [StoryModelModule, DocumentModelModule, ChatModelModule, LedgerModelModule, SnapshotModelModule, ImageStoreModule, ReadAloudManagerModule, VoiceManagerModule],
    providers: [StoryManagerService],
    exports: [StoryManagerService],
})
export class StoryManagerModule {}

import { Module } from '@nestjs/common';

import { ChatModelModule } from '../../model/chat/chat.module.js';
import { LedgerModelModule } from '../../model/ledger/ledger.module.js';
import { MemoryModelModule } from '../../model/memory/memory.module.js';
import { SettingsModelModule } from '../../model/settings/settings.module.js';
import { SnapshotModelModule } from '../../model/snapshot/snapshot.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { SnapshotManagerService } from './snapshot.service.js';

// The Model Gateway is a global provider (ModelGatewayModule.forRoot in AppModule).
@Module({
    imports: [StoryModelModule, ChatModelModule, LedgerModelModule, MemoryModelModule, SnapshotModelModule, ImageStoreModule, SettingsModelModule],
    providers: [SnapshotManagerService],
    exports: [SnapshotManagerService],
})
export class SnapshotManagerModule {}

import { Module } from '@nestjs/common';

import { ChatModelModule } from '../../model/chat/chat.module.js';
import { MemoryModelModule } from '../../model/memory/memory.module.js';
import { SnapshotModelModule } from '../../model/snapshot/snapshot.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { SnapshotManagerService } from './snapshot.service.js';

// The Model Gateway is a global provider (ModelGatewayModule.forRoot in AppModule).
@Module({
    imports: [StoryModelModule, ChatModelModule, MemoryModelModule, SnapshotModelModule, ImageStoreModule],
    providers: [SnapshotManagerService],
    exports: [SnapshotManagerService],
})
export class SnapshotManagerModule {}

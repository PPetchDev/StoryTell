import { Module } from '@nestjs/common';

import { StoryModelModule } from '../../model/story/story.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { StoryManagerService } from './story.service.js';

@Module({
    imports: [StoryModelModule, ImageStoreModule],
    providers: [StoryManagerService],
    exports: [StoryManagerService],
})
export class StoryManagerModule {}

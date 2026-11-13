import { Module } from '@nestjs/common';

import { StoryModelModule } from '../../model/story/story.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { ImageManagerService } from './image.service.js';

@Module({
    imports: [ImageStoreModule, StoryModelModule],
    providers: [ImageManagerService],
    exports: [ImageManagerService],
})
export class ImageManagerModule {}

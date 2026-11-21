import { Module } from '@nestjs/common';

import { StageModelModule } from '../../model/stage/stage.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { StoryManagerModule } from '../story/story.module.js';
import { PlaceManagerService } from './place.service.js';

@Module({
    imports: [StoryManagerModule, StageModelModule, ImageStoreModule],
    providers: [PlaceManagerService],
    exports: [PlaceManagerService],
})
export class PlaceManagerModule {}

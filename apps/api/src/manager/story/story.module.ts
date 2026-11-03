import { Module } from '@nestjs/common';

import { StoryModelModule } from '../../model/story/story.module.js';
import { StoryManagerService } from './story.service.js';

@Module({
    imports: [StoryModelModule],
    providers: [StoryManagerService],
    exports: [StoryManagerService],
})
export class StoryManagerModule {}

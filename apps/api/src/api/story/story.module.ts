import { Module } from '@nestjs/common';

import { StoryManagerModule } from '../../manager/story/story.module.js';
import { StoryApiController } from './story.controller.js';

@Module({
    imports: [StoryManagerModule],
    controllers: [StoryApiController],
})
export class StoryApiModule {}

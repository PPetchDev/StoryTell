import { Module } from '@nestjs/common';

import { ReferenceImageManagerModule } from '../../manager/reference-image/reference-image.module.js';
import { StoryManagerModule } from '../../manager/story/story.module.js';
import { ReferenceImageApiController } from './reference-image.controller.js';

@Module({
    imports: [ReferenceImageManagerModule, StoryManagerModule],
    controllers: [ReferenceImageApiController],
})
export class ReferenceImageApiModule {}

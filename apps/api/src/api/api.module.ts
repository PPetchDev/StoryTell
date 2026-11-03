import { Module } from '@nestjs/common';

import { HealthApiController } from './health/health.controller.js';
import { ImageApiModule } from './image/image.module.js';
import { StoryApiModule } from './story/story.module.js';

@Module({
    imports: [ImageApiModule, StoryApiModule],
    controllers: [HealthApiController],
})
export class ApiModule {}

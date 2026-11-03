import { Module } from '@nestjs/common';

import { HealthApiController } from './health/health.controller.js';
import { ImageApiModule } from './image/image.module.js';
import { SettingsApiModule } from './settings/settings.module.js';
import { StoryDraftingApiModule } from './story-drafting/story-drafting.module.js';
import { StoryApiModule } from './story/story.module.js';
import { UsageApiModule } from './usage/usage.module.js';

@Module({
    imports: [ImageApiModule, StoryApiModule, StoryDraftingApiModule, SettingsApiModule, UsageApiModule],
    controllers: [HealthApiController],
})
export class ApiModule {}

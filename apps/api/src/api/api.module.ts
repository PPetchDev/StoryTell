import { Module } from '@nestjs/common';

import { ChatApiModule } from './chat/chat.module.js';
import { HealthApiController } from './health/health.controller.js';
import { ImageApiModule } from './image/image.module.js';
import { SettingsApiModule } from './settings/settings.module.js';
import { StoryApiModule } from './story/story.module.js';
import { UsageApiModule } from './usage/usage.module.js';

@Module({
    imports: [ImageApiModule, StoryApiModule, ChatApiModule, SettingsApiModule, UsageApiModule],
    controllers: [HealthApiController],
})
export class ApiModule {}

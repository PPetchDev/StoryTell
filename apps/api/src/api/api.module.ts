import { Module } from '@nestjs/common';

import { ChatApiModule } from './chat/chat.module.js';
import { HealthApiController } from './health/health.controller.js';
import { ImageApiModule } from './image/image.module.js';
import { ReferenceImageApiModule } from './reference-image/reference-image.module.js';
import { SettingsApiModule } from './settings/settings.module.js';
import { StoryAssistantApiModule } from './story-assistant/story-assistant.module.js';
import { StoryDraftingApiModule } from './story-drafting/story-drafting.module.js';
import { StoryApiModule } from './story/story.module.js';
import { UsageApiModule } from './usage/usage.module.js';

@Module({
    imports: [
        ImageApiModule,
        StoryApiModule,
        StoryDraftingApiModule,
        StoryAssistantApiModule,
        ChatApiModule,
        SettingsApiModule,
        UsageApiModule,
        ReferenceImageApiModule,
    ],
    controllers: [HealthApiController],
})
export class ApiModule {}

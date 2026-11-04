import { Module } from '@nestjs/common';

import { StoryAssistantManagerModule } from '../../manager/story-assistant/story-assistant.module.js';
import { StoryAssistantApiController } from './story-assistant.controller.js';

@Module({
    imports: [StoryAssistantManagerModule],
    controllers: [StoryAssistantApiController],
})
export class StoryAssistantApiModule {}

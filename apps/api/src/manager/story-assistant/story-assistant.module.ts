import { Module } from '@nestjs/common';

import { StoryManagerModule } from '../story/story.module.js';
import { StoryAssistantManagerService } from './story-assistant.service.js';

// The Model Gateway is a global provider (ModelGatewayModule.forRoot in AppModule).
@Module({
    imports: [StoryManagerModule],
    providers: [StoryAssistantManagerService],
    exports: [StoryAssistantManagerService],
})
export class StoryAssistantManagerModule {}

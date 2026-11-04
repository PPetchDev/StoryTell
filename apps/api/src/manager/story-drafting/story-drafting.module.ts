import { Module } from '@nestjs/common';

import { StoryManagerModule } from '../story/story.module.js';
import { StoryDraftingManagerService } from './story-drafting.service.js';

// The Model Gateway is a global provider (ModelGatewayModule.forRoot in AppModule).
@Module({
    imports: [StoryManagerModule],
    providers: [StoryDraftingManagerService],
    exports: [StoryDraftingManagerService],
})
export class StoryDraftingManagerModule {}

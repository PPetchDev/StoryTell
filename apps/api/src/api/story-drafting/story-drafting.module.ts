import { Module } from '@nestjs/common';

import { StoryDraftingManagerModule } from '../../manager/story-drafting/story-drafting.module.js';
import { StoryDraftingApiController } from './story-drafting.controller.js';

@Module({
    imports: [StoryDraftingManagerModule],
    controllers: [StoryDraftingApiController],
})
export class StoryDraftingApiModule {}

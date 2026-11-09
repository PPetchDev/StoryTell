import { Module } from '@nestjs/common';

import { SavedReplyModelModule } from '../../model/saved-reply/saved-reply.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { StoryManagerModule } from '../story/story.module.js';
import { SavedReplyManagerService } from './saved-reply.service.js';

@Module({
    imports: [SavedReplyModelModule, StoryModelModule, StoryManagerModule],
    providers: [SavedReplyManagerService],
    exports: [SavedReplyManagerService],
})
export class SavedReplyManagerModule {}

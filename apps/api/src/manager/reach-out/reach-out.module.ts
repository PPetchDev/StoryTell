import { Module } from '@nestjs/common';

import { ChatModelModule } from '../../model/chat/chat.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { ChatManagerModule } from '../chat/chat.module.js';
import { ReachOutSchedulerService } from './reach-out-scheduler.service.js';
import { ReachOutSettingsManagerService } from './reach-out-settings.service.js';

/** Reach-outs (.scratch/reach-outs/spec.md): each Chat's setting, and the scheduler that sends them. */
@Module({
    imports: [ChatManagerModule, ChatModelModule, StoryModelModule],
    providers: [ReachOutSchedulerService, ReachOutSettingsManagerService],
    exports: [ReachOutSchedulerService, ReachOutSettingsManagerService],
})
export class ReachOutManagerModule {}

import { Module } from '@nestjs/common';

import { ChatModelModule } from '../../model/chat/chat.module.js';
import { SettingsModelModule } from '../../model/settings/settings.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { UsageRecordModelModule } from '../../model/usage-record/usage-record.module.js';
import { ReplyCostManagerService } from './reply-cost.service.js';
import { UsageManagerService } from './usage.service.js';

@Module({
    imports: [UsageRecordModelModule, SettingsModelModule, StoryModelModule, ChatModelModule],
    providers: [UsageManagerService, ReplyCostManagerService],
    exports: [UsageManagerService, ReplyCostManagerService],
})
export class UsageManagerModule {}

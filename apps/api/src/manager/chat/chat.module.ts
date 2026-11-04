import { Module } from '@nestjs/common';

import { ChatModelModule } from '../../model/chat/chat.module.js';
import { LedgerModelModule } from '../../model/ledger/ledger.module.js';
import { SettingsModelModule } from '../../model/settings/settings.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { ChatManagerService } from './chat.service.js';
import { JudgeManagerService } from './judge/judge.service.js';

@Module({
    imports: [ChatModelModule, StoryModelModule, SettingsModelModule, LedgerModelModule],
    providers: [ChatManagerService, JudgeManagerService],
    exports: [ChatManagerService],
})
export class ChatManagerModule {}

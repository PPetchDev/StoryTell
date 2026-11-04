import { Module } from '@nestjs/common';

import { ChatModelModule } from '../../model/chat/chat.module.js';
import { SettingsModelModule } from '../../model/settings/settings.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { ChatManagerService } from './chat.service.js';

@Module({
    imports: [ChatModelModule, StoryModelModule, SettingsModelModule],
    providers: [ChatManagerService],
    exports: [ChatManagerService],
})
export class ChatManagerModule {}

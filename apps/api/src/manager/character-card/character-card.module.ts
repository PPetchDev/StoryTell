import { Module } from '@nestjs/common';

import { StoryManagerModule } from '../story/story.module.js';
import { VoiceManagerModule } from '../voice/voice.module.js';
import { CharacterCardManagerService } from './character-card.service.js';

@Module({
    imports: [StoryManagerModule, VoiceManagerModule],
    providers: [CharacterCardManagerService],
    exports: [CharacterCardManagerService],
})
export class CharacterCardManagerModule {}

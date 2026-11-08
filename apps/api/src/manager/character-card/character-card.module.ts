import { Module } from '@nestjs/common';

import { StoryManagerModule } from '../story/story.module.js';
import { CharacterCardManagerService } from './character-card.service.js';

@Module({
    imports: [StoryManagerModule],
    providers: [CharacterCardManagerService],
    exports: [CharacterCardManagerService],
})
export class CharacterCardManagerModule {}

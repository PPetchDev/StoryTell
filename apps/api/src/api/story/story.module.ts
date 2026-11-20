import { Module } from '@nestjs/common';

import { StoryManagerModule } from '../../manager/story/story.module.js';
import { StoryCoverApiController } from './story-cover.controller.js';
import { StoryApiController } from './story.controller.js';

import { LoreSetApiController } from './lore-set.controller.js';
import { CharacterSecretsApiController } from './character-secrets.controller.js';
import { RoleImageApiController } from './role-image.controller.js';

@Module({
    imports: [StoryManagerModule],
    controllers: [StoryApiController, StoryCoverApiController, LoreSetApiController, CharacterSecretsApiController, RoleImageApiController],
})
export class StoryApiModule {}

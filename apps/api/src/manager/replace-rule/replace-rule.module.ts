import { Module } from '@nestjs/common';

import { ReplaceRuleModelModule } from '../../model/replace-rule/replace-rule.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { StoryManagerModule } from '../story/story.module.js';
import { ReplaceRuleManagerService } from './replace-rule.service.js';

@Module({
    imports: [ReplaceRuleModelModule, StoryModelModule, StoryManagerModule],
    providers: [ReplaceRuleManagerService],
    exports: [ReplaceRuleManagerService],
})
export class ReplaceRuleManagerModule {}

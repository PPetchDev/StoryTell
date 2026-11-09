import { Module } from '@nestjs/common';

import { ReplaceRuleManagerModule } from '../../manager/replace-rule/replace-rule.module.js';
import { ReplaceRuleApiController, StoryReplaceRuleApiController } from './replace-rule.controller.js';

@Module({
    imports: [ReplaceRuleManagerModule],
    controllers: [ReplaceRuleApiController, StoryReplaceRuleApiController],
})
export class ReplaceRuleApiModule {}

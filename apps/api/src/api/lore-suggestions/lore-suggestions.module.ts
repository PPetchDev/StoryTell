import { Module } from '@nestjs/common';

import { LoreSuggestionsManagerModule } from '../../manager/lore-suggestions/lore-suggestions.module.js';
import { LoreSuggestionsApiController } from './lore-suggestions.controller.js';

@Module({
    imports: [LoreSuggestionsManagerModule],
    controllers: [LoreSuggestionsApiController],
})
export class LoreSuggestionsApiModule {}

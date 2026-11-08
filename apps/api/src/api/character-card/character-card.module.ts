import { Module } from '@nestjs/common';

import { CharacterCardManagerModule } from '../../manager/character-card/character-card.module.js';
import { CharacterCardApiController } from './character-card.controller.js';

@Module({
    imports: [CharacterCardManagerModule],
    controllers: [CharacterCardApiController],
})
export class CharacterCardApiModule {}

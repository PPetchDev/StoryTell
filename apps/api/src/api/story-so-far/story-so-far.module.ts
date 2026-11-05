import { Module } from '@nestjs/common';

import { ChatManagerModule } from '../../manager/chat/chat.module.js';
import { StorySoFarApiController } from './story-so-far.controller.js';

@Module({
    imports: [ChatManagerModule],
    controllers: [StorySoFarApiController],
})
export class StorySoFarApiModule {}

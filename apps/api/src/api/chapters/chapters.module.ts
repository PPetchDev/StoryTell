import { Module } from '@nestjs/common';

import { ChatManagerModule } from '../../manager/chat/chat.module.js';
import { ChaptersApiController } from './chapters.controller.js';

@Module({
    imports: [ChatManagerModule],
    controllers: [ChaptersApiController],
})
export class ChaptersApiModule {}

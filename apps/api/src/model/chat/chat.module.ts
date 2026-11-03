import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatModelService } from './chat.service.js';
import { ChatEntity } from './entities/chat.entity.js';
import { MessagePartEntity } from './entities/message-part.entity.js';
import { MessageEntity } from './entities/message.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([ChatEntity, MessageEntity, MessagePartEntity])],
    providers: [ChatModelService],
    exports: [ChatModelService],
})
export class ChatModelModule {}

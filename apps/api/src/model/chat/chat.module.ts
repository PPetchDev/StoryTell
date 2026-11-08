import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatModelService } from './chat.service.js';
import { ChatSittingOutEntity } from './entities/chat-sitting-out.entity.js';
import { ChatEntity } from './entities/chat.entity.js';
import { MessagePartEntity } from './entities/message-part.entity.js';
import { MessageEntity } from './entities/message.entity.js';
import { ReplyVersionEntity } from './entities/reply-version.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([ChatEntity, ChatSittingOutEntity, MessageEntity, MessagePartEntity, ReplyVersionEntity])],
    providers: [ChatModelService],
    exports: [ChatModelService],
})
export class ChatModelModule {}

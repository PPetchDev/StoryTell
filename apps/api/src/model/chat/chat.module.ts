import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MessageBookmarkModelService } from './bookmark.service.js';
import { ChatModelService } from './chat.service.js';
import { ReachOutModelService } from './reach-out.service.js';
import { ChatReachOutEntity } from './entities/chat-reach-out.entity.js';
import { ChatSittingOutEntity } from './entities/chat-sitting-out.entity.js';
import { ChatEntity } from './entities/chat.entity.js';
import { MessagePartEntity } from './entities/message-part.entity.js';
import { MessageBookmarkEntity } from './entities/message-bookmark.entity.js';
import { MessageThoughtEntity } from './entities/message-thought.entity.js';
import { MessageEntity } from './entities/message.entity.js';
import { ReplyVersionEntity } from './entities/reply-version.entity.js';
import { ThaiReadingEntity } from './entities/thai-reading.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([ChatEntity, ChatSittingOutEntity, MessageEntity, MessagePartEntity, ReplyVersionEntity, ThaiReadingEntity, MessageThoughtEntity, MessageBookmarkEntity, ChatReachOutEntity])],
    providers: [ChatModelService, MessageBookmarkModelService, ReachOutModelService],
    exports: [ChatModelService, MessageBookmarkModelService, ReachOutModelService],
})
export class ChatModelModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReplacedReplyEntity } from './entities/replaced-reply.entity.js';
import { RepairRecordEntity } from './entities/repair-record.entity.js';
import { ReplyRecordModelService } from './reply-record.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([RepairRecordEntity, ReplacedReplyEntity])],
    providers: [ReplyRecordModelService],
    exports: [ReplyRecordModelService],
})
export class ReplyRecordModelModule {}

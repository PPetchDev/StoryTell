import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SavedReplyEntity } from './entities/saved-reply.entity.js';
import { SavedReplyModelService } from './saved-reply.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([SavedReplyEntity])],
    providers: [SavedReplyModelService],
    exports: [SavedReplyModelService],
})
export class SavedReplyModelModule {}

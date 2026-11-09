import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DocumentModelService } from './document.service.js';
import { DocumentPassageEntity } from './entities/document-passage.entity.js';
import { DocumentEntity } from './entities/document.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([DocumentEntity, DocumentPassageEntity])],
    providers: [DocumentModelService],
    exports: [DocumentModelService],
})
export class DocumentModelModule {}

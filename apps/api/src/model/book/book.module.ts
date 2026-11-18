import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BookModelService } from './book.service.js';
import { BookChapterEntity } from './entities/book-chapter.entity.js';

@Module({
    imports: [TypeOrmModule.forFeature([BookChapterEntity])],
    providers: [BookModelService],
    exports: [BookModelService],
})
export class BookModelModule {}

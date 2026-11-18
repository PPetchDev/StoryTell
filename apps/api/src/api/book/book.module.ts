import { Module } from '@nestjs/common';

import { BookManagerModule } from '../../manager/chat/book/book.module.js';
import { BookApiController } from './book.controller.js';

@Module({
    imports: [BookManagerModule],
    controllers: [BookApiController],
})
export class BookApiModule {}

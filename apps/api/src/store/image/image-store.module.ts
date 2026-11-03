import { Module } from '@nestjs/common';

import { ImageStoreService } from './image-store.service.js';

@Module({
    providers: [ImageStoreService],
    exports: [ImageStoreService],
})
export class ImageStoreModule {}

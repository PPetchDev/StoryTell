import { Module } from '@nestjs/common';

import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { ImageManagerService } from './image.service.js';

@Module({
    imports: [ImageStoreModule],
    providers: [ImageManagerService],
    exports: [ImageManagerService],
})
export class ImageManagerModule {}

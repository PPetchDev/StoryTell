import { Module } from '@nestjs/common';

import { ImageManagerModule } from '../../manager/image/image.module.js';
import { ImageApiController } from './image.controller.js';

@Module({
    imports: [ImageManagerModule],
    controllers: [ImageApiController],
})
export class ImageApiModule {}

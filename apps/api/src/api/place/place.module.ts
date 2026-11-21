import { Module } from '@nestjs/common';

import { PlaceManagerModule } from '../../manager/place/place.module.js';
import { PlaceApiController } from './place.controller.js';

@Module({
    imports: [PlaceManagerModule],
    controllers: [PlaceApiController],
})
export class PlaceApiModule {}

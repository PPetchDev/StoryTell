import { Module } from '@nestjs/common';

import { RecapManagerModule } from '../../manager/recap/recap.module.js';
import { RecapApiController } from './recap.controller.js';

@Module({
    imports: [RecapManagerModule],
    controllers: [RecapApiController],
})
export class RecapApiModule {}

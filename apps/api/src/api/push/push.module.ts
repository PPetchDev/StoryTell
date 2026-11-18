import { Module } from '@nestjs/common';

import { PushApiController } from './push.controller.js';

@Module({
    controllers: [PushApiController],
})
export class PushApiModule {}

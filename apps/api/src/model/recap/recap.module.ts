import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ChatRecapEntity } from './entities/chat-recap.entity.js';
import { RecapModelService } from './recap.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([ChatRecapEntity])],
    providers: [RecapModelService],
    exports: [RecapModelService],
})
export class RecapModelModule {}

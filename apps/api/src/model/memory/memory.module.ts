import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { BeliefModelService } from './belief.service.js';
import { BeliefEntity } from './entities/belief.entity.js';
import { MemoryKnownByEntity } from './entities/memory-known-by.entity.js';
import { MemoryEntity } from './entities/memory.entity.js';
import { MemoryModelService } from './memory.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([MemoryEntity, MemoryKnownByEntity, BeliefEntity])],
    providers: [MemoryModelService, BeliefModelService],
    exports: [MemoryModelService, BeliefModelService],
})
export class MemoryModelModule {}

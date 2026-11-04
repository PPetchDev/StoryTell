import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { MemoryKnownByEntity } from './entities/memory-known-by.entity.js';
import { MemoryEntity } from './entities/memory.entity.js';
import { MemoryModelService } from './memory.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([MemoryEntity, MemoryKnownByEntity])],
    providers: [MemoryModelService],
    exports: [MemoryModelService],
})
export class MemoryModelModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SnapshotCharacterEntity } from './entities/snapshot-character.entity.js';
import { SnapshotEntity } from './entities/snapshot.entity.js';
import { SnapshotModelService } from './snapshot.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([SnapshotEntity, SnapshotCharacterEntity])],
    providers: [SnapshotModelService],
    exports: [SnapshotModelService],
})
export class SnapshotModelModule {}

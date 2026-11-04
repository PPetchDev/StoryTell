import { Module } from '@nestjs/common';

import { SnapshotManagerModule } from '../../manager/snapshot/snapshot.module.js';
import { SnapshotApiController } from './snapshot.controller.js';

@Module({
    imports: [SnapshotManagerModule],
    controllers: [SnapshotApiController],
})
export class SnapshotApiModule {}

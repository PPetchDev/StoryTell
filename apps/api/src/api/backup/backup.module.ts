import { Module } from '@nestjs/common';

import { BackupManagerModule } from '../../manager/backup/backup.module.js';
import { BackupApiController } from './backup.controller.js';

@Module({
    imports: [BackupManagerModule],
    controllers: [BackupApiController],
})
export class BackupApiModule {}

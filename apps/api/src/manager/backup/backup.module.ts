import { Module } from '@nestjs/common';

import { BackupManagerService } from './backup.service.js';

@Module({
    providers: [BackupManagerService],
    exports: [BackupManagerService],
})
export class BackupManagerModule {}

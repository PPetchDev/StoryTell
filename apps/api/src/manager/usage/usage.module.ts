import { Module } from '@nestjs/common';

import { SettingsModelModule } from '../../model/settings/settings.module.js';
import { UsageRecordModelModule } from '../../model/usage-record/usage-record.module.js';
import { UsageManagerService } from './usage.service.js';

@Module({
    imports: [UsageRecordModelModule, SettingsModelModule],
    providers: [UsageManagerService],
    exports: [UsageManagerService],
})
export class UsageManagerModule {}

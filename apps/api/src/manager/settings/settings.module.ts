import { Module } from '@nestjs/common';

import { SettingsModelModule } from '../../model/settings/settings.module.js';
import { SettingsManagerService } from './settings.service.js';

@Module({
    imports: [SettingsModelModule],
    providers: [SettingsManagerService],
    exports: [SettingsManagerService],
})
export class SettingsManagerModule {}

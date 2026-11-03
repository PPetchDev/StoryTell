import { Module } from '@nestjs/common';

import { SettingsManagerModule } from '../../manager/settings/settings.module.js';
import { SettingsApiController } from './settings.controller.js';

@Module({
    imports: [SettingsManagerModule],
    controllers: [SettingsApiController],
})
export class SettingsApiModule {}

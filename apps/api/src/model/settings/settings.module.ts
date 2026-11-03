import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SettingsEntity } from './entities/settings.entity.js';
import { SettingsModelService } from './settings.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([SettingsEntity])],
    providers: [SettingsModelService],
    exports: [SettingsModelService],
})
export class SettingsModelModule {}

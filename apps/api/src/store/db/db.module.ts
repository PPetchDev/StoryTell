import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppConfig } from '../../config/app-config.js';
import { dataSourceOptions } from './data-source.js';

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            inject: [AppConfig],
            useFactory: (config: AppConfig) => dataSourceOptions(config.databaseUrl),
        }),
    ],
})
export class DbModule {}

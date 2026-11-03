import { DataSource, DataSourceOptions } from 'typeorm';

import { migrations } from '../../migration/index.js';
import { entities } from './entities.js';

export function dataSourceOptions(databaseUrl: string): DataSourceOptions {
    return {
        type: 'postgres',
        url: databaseUrl,
        entities,
        migrations,
        // Schema changes only ever come from migrations. Live runs them in its deploy step.
        synchronize: false,
        migrationsRun: false,
    };
}

export function createDataSource(databaseUrl: string): DataSource {
    return new DataSource(dataSourceOptions(databaseUrl));
}


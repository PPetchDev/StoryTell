import { Module } from '@nestjs/common';

import { UsageRecordModelModule } from '../../model/usage-record/usage-record.module.js';
import { PeopleManagerService } from './people.service.js';

@Module({
    imports: [UsageRecordModelModule],
    providers: [PeopleManagerService],
    exports: [PeopleManagerService],
})
export class PeopleManagerModule {}

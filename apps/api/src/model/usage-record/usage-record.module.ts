import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UsageRecordEntity } from './entities/usage-record.entity.js';
import { UsageRecordModelService } from './usage-record.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([UsageRecordEntity])],
    providers: [UsageRecordModelService],
    exports: [UsageRecordModelService],
})
export class UsageRecordModelModule {}

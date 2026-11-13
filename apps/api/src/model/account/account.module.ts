import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AccountModelService } from './account.service.js';
import { AccountEntity } from './entities/account.entity.js';

/** Global: every model service that stores an owned row asks it for the current Account. */
@Global()
@Module({
    imports: [TypeOrmModule.forFeature([AccountEntity])],
    providers: [AccountModelService],
    exports: [AccountModelService],
})
export class AccountModelModule {}

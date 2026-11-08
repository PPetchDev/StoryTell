import { Module } from '@nestjs/common';

import { LedgerModelModule } from '../ledger/ledger.module.js';
import { BranchModelService } from './branch.service.js';

@Module({
    imports: [LedgerModelModule],
    providers: [BranchModelService],
    exports: [BranchModelService],
})
export class BranchModelModule {}

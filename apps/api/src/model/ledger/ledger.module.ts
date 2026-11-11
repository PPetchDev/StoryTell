import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ArcStepEntity } from './entities/arc-step.entity.js';
import { BeliefChangeEntity } from './entities/belief-change.entity.js';
import { BondChangeEntity } from './entities/bond-change.entity.js';
import { ChatArcDirectionEntity } from './entities/chat-arc-direction.entity.js';
import { MemoryChangeEntity } from './entities/memory-change.entity.js';
import { SceneAdvanceEntity } from './entities/scene-advance.entity.js';
import { TimeChangeEntity } from './entities/time-change.entity.js';
import { LedgerModelService } from './ledger.service.js';

@Module({
    imports: [
        TypeOrmModule.forFeature([
            BondChangeEntity,
            ArcStepEntity,
            SceneAdvanceEntity,
            TimeChangeEntity,
            ChatArcDirectionEntity,
            MemoryChangeEntity,
            BeliefChangeEntity,
        ]),
    ],
    providers: [LedgerModelService],
    exports: [LedgerModelService],
})
export class LedgerModelModule {}

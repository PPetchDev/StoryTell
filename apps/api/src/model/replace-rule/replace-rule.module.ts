import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReplaceRuleEntity } from './entities/replace-rule.entity.js';
import { ReplaceRuleModelService } from './replace-rule.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([ReplaceRuleEntity])],
    providers: [ReplaceRuleModelService],
    exports: [ReplaceRuleModelService],
})
export class ReplaceRuleModelModule {}

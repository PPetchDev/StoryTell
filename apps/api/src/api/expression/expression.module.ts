import { Module } from '@nestjs/common';

import { ExpressionManagerModule } from '../../manager/expression/expression.module.js';
import { ExpressionApiController } from './expression.controller.js';

@Module({
    imports: [ExpressionManagerModule],
    controllers: [ExpressionApiController],
})
export class ExpressionApiModule {}

import { Module } from '@nestjs/common';

import { ExpressionManagerModule } from '../../manager/expression/expression.module.js';
import { ExpressionDrawingApiController } from './expression-drawing.controller.js';
import { ExpressionApiController } from './expression.controller.js';

@Module({
    imports: [ExpressionManagerModule],
    controllers: [ExpressionApiController, ExpressionDrawingApiController],
})
export class ExpressionApiModule {}

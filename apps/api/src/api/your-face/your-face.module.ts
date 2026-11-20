import { Module } from '@nestjs/common';

import { YourFaceManagerModule } from '../../manager/your-face/your-face.module.js';
import {
    PersonaExpressionApiController,
    PersonaExpressionDrawingApiController,
    RoleExpressionApiController,
    RoleExpressionDrawingApiController,
} from './your-face.controller.js';

@Module({
    imports: [YourFaceManagerModule],
    controllers: [RoleExpressionApiController, RoleExpressionDrawingApiController, PersonaExpressionApiController, PersonaExpressionDrawingApiController],
})
export class YourFaceApiModule {}

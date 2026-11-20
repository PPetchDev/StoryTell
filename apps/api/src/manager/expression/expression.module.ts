import { Module } from '@nestjs/common';

import { StoryModelModule } from '../../model/story/story.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { StoryManagerModule } from '../story/story.module.js';
import { ExpressionDrawingService } from './expression-drawing.service.js';
import { ExpressionManagerService } from './expression.service.js';

@Module({
    imports: [StoryManagerModule, StoryModelModule, ImageStoreModule],
    providers: [ExpressionManagerService, ExpressionDrawingService],
    exports: [ExpressionManagerService, ExpressionDrawingService],
})
export class ExpressionManagerModule {}

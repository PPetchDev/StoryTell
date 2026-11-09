import { Module } from '@nestjs/common';

import { StoryModelModule } from '../../model/story/story.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { StoryManagerModule } from '../story/story.module.js';
import { ExpressionManagerService } from './expression.service.js';

@Module({
    imports: [StoryManagerModule, StoryModelModule, ImageStoreModule],
    providers: [ExpressionManagerService],
    exports: [ExpressionManagerService],
})
export class ExpressionManagerModule {}

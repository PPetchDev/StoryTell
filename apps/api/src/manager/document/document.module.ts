import { Module } from '@nestjs/common';

import { DocumentModelModule } from '../../model/document/document.module.js';
import { StoryModelModule } from '../../model/story/story.module.js';
import { StoryManagerModule } from '../story/story.module.js';
import { DocumentManagerService } from './document.service.js';

@Module({
    imports: [DocumentModelModule, StoryModelModule, StoryManagerModule],
    providers: [DocumentManagerService],
    exports: [DocumentManagerService],
})
export class DocumentManagerModule {}

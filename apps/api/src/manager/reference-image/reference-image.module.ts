import { Module } from '@nestjs/common';

import { StoryManagerModule } from '../story/story.module.js';
import { ReferenceImageManagerService } from './reference-image.service.js';

// The Model Gateway is a global provider (ModelGatewayModule.forRoot in AppModule).
@Module({
    imports: [StoryManagerModule],
    providers: [ReferenceImageManagerService],
    exports: [ReferenceImageManagerService],
})
export class ReferenceImageManagerModule {}

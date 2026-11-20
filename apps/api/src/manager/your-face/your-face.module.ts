import { Module } from '@nestjs/common';

import { StoryModelModule } from '../../model/story/story.module.js';
import { YourFaceModelModule } from '../../model/your-face/your-face.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { PersonaManagerModule } from '../persona/persona.module.js';
import { StoryManagerModule } from '../story/story.module.js';
import { YourFaceManagerService } from './your-face.service.js';

@Module({
    imports: [StoryManagerModule, StoryModelModule, PersonaManagerModule, YourFaceModelModule, ImageStoreModule],
    providers: [YourFaceManagerService],
    exports: [YourFaceManagerService],
})
export class YourFaceManagerModule {}

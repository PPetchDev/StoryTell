import { Module } from '@nestjs/common';

import { PersonaModelModule } from '../../model/persona/persona.module.js';
import { ImageStoreModule } from '../../store/image/image-store.module.js';
import { PersonaManagerService } from './persona.service.js';

@Module({
    imports: [PersonaModelModule, ImageStoreModule],
    providers: [PersonaManagerService],
    exports: [PersonaManagerService],
})
export class PersonaManagerModule {}

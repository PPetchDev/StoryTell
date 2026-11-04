import { Module } from '@nestjs/common';

import { PersonaModelModule } from '../../model/persona/persona.module.js';
import { PersonaManagerService } from './persona.service.js';

@Module({
    imports: [PersonaModelModule],
    providers: [PersonaManagerService],
    exports: [PersonaManagerService],
})
export class PersonaManagerModule {}

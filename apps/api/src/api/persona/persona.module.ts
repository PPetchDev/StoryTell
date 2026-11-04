import { Module } from '@nestjs/common';

import { PersonaManagerModule } from '../../manager/persona/persona.module.js';
import { PersonaApiController } from './persona.controller.js';

@Module({
    imports: [PersonaManagerModule],
    controllers: [PersonaApiController],
})
export class PersonaApiModule {}

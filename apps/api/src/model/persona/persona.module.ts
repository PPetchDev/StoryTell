import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PersonaEntity } from './entities/persona.entity.js';
import { PersonaModelService } from './persona.service.js';

@Module({
    imports: [TypeOrmModule.forFeature([PersonaEntity])],
    providers: [PersonaModelService],
    exports: [PersonaModelService],
})
export class PersonaModelModule {}

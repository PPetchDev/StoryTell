import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PersonaEntity } from './entities/persona.entity.js';

/** Repository wrapper for Personas. No rules here. */
@Injectable()
export class PersonaModelService {
    constructor(@InjectRepository(PersonaEntity) private readonly personas: Repository<PersonaEntity>) {}

    /** Every Persona, oldest first. */
    findAll(): Promise<PersonaEntity[]> {
        return this.personas.find({ order: { id: 'ASC' } });
    }

    findOne(id: number): Promise<PersonaEntity | null> {
        return this.personas.findOneBy({ id });
    }

    save(persona: Partial<PersonaEntity>): Promise<PersonaEntity> {
        return this.personas.save(this.personas.create(persona));
    }

    /** Chats wearing it fall back to the Role and Messages lose the reference through ON DELETE SET NULL. */
    async remove(id: number): Promise<void> {
        await this.personas.delete({ id });
    }
}

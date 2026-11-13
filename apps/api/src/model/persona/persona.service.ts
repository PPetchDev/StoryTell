import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AccountModelService } from '../account/account.service.js';
import { PersonaEntity } from './entities/persona.entity.js';

/** Repository wrapper for Personas. No rules here. */
@Injectable()
export class PersonaModelService {
    constructor(
        @InjectRepository(PersonaEntity) private readonly personas: Repository<PersonaEntity>,
        private readonly accounts: AccountModelService,
    ) {}

    /** Every Persona, oldest first. */
    findAll(): Promise<PersonaEntity[]> {
        return this.personas.find({ where: { userId: this.accounts.currentId() }, order: { id: 'ASC' } });
    }

    /** The current Account's Persona; another Account's answers as missing. */
    findOne(id: number): Promise<PersonaEntity | null> {
        return this.personas.findOneBy({ id, userId: this.accounts.currentId() });
    }

    save(persona: Partial<PersonaEntity>): Promise<PersonaEntity> {
        return this.personas.save(this.personas.create(this.accounts.owned(persona)));
    }

    /** Chats wearing it fall back to the Role and Messages lose the reference through ON DELETE SET NULL. */
    async remove(id: number): Promise<void> {
        await this.personas.delete({ id, userId: this.accounts.currentId() });
    }
}

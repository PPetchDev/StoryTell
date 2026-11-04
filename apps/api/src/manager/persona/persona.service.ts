import { Injectable } from '@nestjs/common';

import { EmptyPersonaNameError, PersonaNotFoundError } from '../../errors/persona.errors.js';
import { PersonaEntity, PersonaResponse } from '../../model/persona/entities/persona.entity.js';
import { PersonaModelService } from '../../model/persona/persona.service.js';

/**
 * Personas (spec: "Personas: create, read, update, delete"). Renaming or deleting one never
 * touches the names stamped on User Messages; deleting a worn one falls its Chats back to
 * the Role (the database clears the reference).
 */
@Injectable()
export class PersonaManagerService {
    constructor(private readonly personaModel: PersonaModelService) {}

    async list(): Promise<PersonaResponse[]> {
        return (await this.personaModel.findAll()).map((persona) => persona.toResponse());
    }

    async get(id: number): Promise<PersonaResponse> {
        return (await this.find(id)).toResponse();
    }

    async create(fields: { name: string; description?: string }): Promise<PersonaResponse> {
        const name = requireName(fields.name);
        const persona = await this.personaModel.save({ name, description: fields.description?.trim() ?? '' });
        return persona.toResponse();
    }

    /** Only the fields sent change. */
    async update(id: number, fields: { name?: string; description?: string }): Promise<PersonaResponse> {
        const persona = await this.find(id);
        if (fields.name !== undefined) persona.name = requireName(fields.name);
        if (fields.description !== undefined) persona.description = fields.description.trim();
        return (await this.personaModel.save(persona)).toResponse();
    }

    async remove(id: number): Promise<void> {
        const persona = await this.find(id);
        await this.personaModel.remove(persona.id);
    }

    private async find(id: number): Promise<PersonaEntity> {
        const persona = await this.personaModel.findOne(id);
        if (!persona) throw new PersonaNotFoundError();
        return persona;
    }
}

function requireName(name: string): string {
    const trimmed = name.trim();
    if (trimmed === '') throw new EmptyPersonaNameError();
    return trimmed;
}

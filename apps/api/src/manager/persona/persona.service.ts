import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { UnsupportedImageError } from '../../errors/image.errors.js';
import { ImageStoreService } from '../../store/image/image-store.service.js';

import { EmptyPersonaNameError, PersonaNotFoundError } from '../../errors/persona.errors.js';
import { PersonaEntity, PersonaResponse } from '../../model/persona/entities/persona.entity.js';
import { PersonaModelService } from '../../model/persona/persona.service.js';

/**
 * Personas (spec: "Personas: create, read, update, delete"). Renaming or deleting one never
 * touches the names stamped on User Messages; deleting a worn one falls its Chats back to
 * the Role (the database clears the reference). A Persona owns its picture's file
 * (.scratch/persona-image/spec.md): replacing, clearing or deleting the Persona deletes it.
 */
@Injectable()
export class PersonaManagerService {
    private readonly logger = new Logger(PersonaManagerService.name);

    constructor(
        private readonly personaModel: PersonaModelService,
        private readonly imageStore: ImageStoreService,
    ) {}

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
        if (persona.imagePath) await this.removeFile(persona.imagePath);
        // Its Expressions (.scratch/your-faces/spec.md): their rows went with it.
        for (const expression of persona.expressions ?? []) {
            await this.removeFile(expression.imagePath);
            if (expression.cutoutPath) await this.removeFile(expression.cutoutPath);
        }
    }

    /**
     * Stores an uploaded picture as the Persona's (.scratch/persona-image/spec.md). The type is read
     * from the bytes, not from what the upload claims, and the file is written before the Persona
     * points at it; the picture it replaces is deleted after.
     */
    async uploadImage(id: number, bytes: Buffer): Promise<PersonaResponse> {
        const persona = await this.find(id);
        const mimeType = ImageStoreService.sniffMimeType(bytes);
        if (!mimeType) throw new UnsupportedImageError();
        const extension = ImageStoreService.extensionFor(mimeType)!;
        // A fresh name per upload, so a browser never shows the replaced picture from its cache.
        const relativePath = `personas/persona-${persona.id}/picture-${randomBytes(6).toString('hex')}.${extension}`;
        await this.imageStore.write(relativePath, bytes);
        const previous = persona.imagePath;
        persona.imagePath = relativePath;
        try {
            await this.personaModel.save(persona);
        } catch (error) {
            await this.removeFile(relativePath);
            throw error;
        }
        if (previous) await this.removeFile(previous);
        return persona.toResponse();
    }

    /** Back to no picture: the Persona shows its initial again, and the file is deleted. */
    async clearImage(id: number): Promise<PersonaResponse> {
        const persona = await this.find(id);
        const previous = persona.imagePath;
        if (!previous) return persona.toResponse();
        persona.imagePath = null;
        await this.personaModel.save(persona);
        await this.removeFile(previous);
        return persona.toResponse();
    }

    /** A file that will not go is logged and left: the Persona no longer points at it. */
    private async removeFile(relativePath: string): Promise<void> {
        try {
            await this.imageStore.remove(relativePath);
        } catch (error) {
            this.logger.warn(`Could not delete ${relativePath}: ${error instanceof Error ? error.message : error}`);
        }
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

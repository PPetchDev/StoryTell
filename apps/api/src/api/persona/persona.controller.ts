import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { PersonaManagerService } from '../../manager/persona/persona.service.js';
import { CreatePersonaRequestBodyDTO, UpdatePersonaRequestBodyDTO } from './dto/persona.request.dto.js';
import { ListPersonasResponseBodyDTO, PersonaResponseBodyDTO } from './dto/persona.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/** App-level Personas: create, read, update, delete (spec: "API surface"). */
@ApiTags('Personas')
@Controller('personas')
export class PersonaApiController {
    constructor(private readonly personaManager: PersonaManagerService) {}

    @Get()
    @ApiOkResponse({ type: ListPersonasResponseBodyDTO })
    async list(): Promise<ListPersonasResponseBodyDTO> {
        return { personas: await this.personaManager.list() };
    }

    @Post()
    @ApiCreatedResponse({ type: PersonaResponseBodyDTO })
    create(@Body() body: CreatePersonaRequestBodyDTO): Promise<PersonaResponseBodyDTO> {
        return this.personaManager.create(body);
    }

    @Get(':personaId')
    @ApiOkResponse({ type: PersonaResponseBodyDTO })
    get(@Id('personaId') personaId: number): Promise<PersonaResponseBodyDTO> {
        return this.personaManager.get(personaId);
    }

    @Patch(':personaId')
    @ApiOkResponse({ type: PersonaResponseBodyDTO })
    update(@Id('personaId') personaId: number, @Body() body: UpdatePersonaRequestBodyDTO): Promise<PersonaResponseBodyDTO> {
        return this.personaManager.update(personaId, body);
    }

    /** Chats wearing it fall back to their Story's Role; User Messages keep their stamped name. */
    @Delete(':personaId')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'The Persona is gone.' })
    remove(@Id('personaId') personaId: number): Promise<void> {
        return this.personaManager.remove(personaId);
    }
}

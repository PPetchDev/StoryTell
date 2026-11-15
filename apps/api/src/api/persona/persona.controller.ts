import {
    ArgumentsHost,
    Body,
    Catch,
    Controller,
    Delete,
    ExceptionFilter,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Patch,
    PayloadTooLargeException,
    Post,
    Put,
    UploadedFile,
    UseFilters,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ImageTooLargeError, NoImageFileError } from '../../errors/image.errors.js';
import { AppErrorFilter } from '../../filter/app-error.filter.js';

import { PersonaManagerService } from '../../manager/persona/persona.service.js';
import { CreatePersonaRequestBodyDTO, UpdatePersonaRequestBodyDTO } from './dto/persona.request.dto.js';
import { ListPersonasResponseBodyDTO, PersonaResponseBodyDTO } from './dto/persona.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

const MAX_UPLOAD_MB = 15;

/** The part of a multer file this controller reads. */
interface UploadedImage {
    buffer: Buffer;
}

/** Multer's size limit surfaces as Nest's 413; answer it with the typed domain error instead. */
@Catch(PayloadTooLargeException)
class UploadTooLargeFilter implements ExceptionFilter {
    catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
        new AppErrorFilter().catch(new ImageTooLargeError(MAX_UPLOAD_MB), host);
    }
}

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

    /**
     * .scratch/persona-image/spec.md: an uploaded picture becomes the Persona's, which owns the
     * file. The one it replaces is deleted.
     */
    @Put(':personaId/image')
    @UseFilters(UploadTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', required: ['image'], properties: { image: { type: 'string', format: 'binary', description: 'A PNG, JPEG or WebP of at most 15 MB.' } } } })
    @ApiOkResponse({ type: PersonaResponseBodyDTO })
    uploadImage(@Id('personaId') personaId: number, @UploadedFile() file: UploadedImage | undefined): Promise<PersonaResponseBodyDTO> {
        if (!file) throw new NoImageFileError();
        return this.personaManager.uploadImage(personaId, file.buffer);
    }

    /** No picture again; the file is deleted. */
    @Delete(':personaId/image')
    @ApiOkResponse({ type: PersonaResponseBodyDTO })
    clearImage(@Id('personaId') personaId: number): Promise<PersonaResponseBodyDTO> {
        return this.personaManager.clearImage(personaId);
    }

    /** Chats wearing it fall back to their Story's Role; User Messages keep their stamped name. */
    @Delete(':personaId')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'The Persona is gone.' })
    remove(@Id('personaId') personaId: number): Promise<void> {
        return this.personaManager.remove(personaId);
    }
}

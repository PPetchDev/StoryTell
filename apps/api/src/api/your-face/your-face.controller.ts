import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseIntPipe, Post, Put, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';

import { NoImageFileError } from '../../errors/image.errors.js';
import { YourFaceManagerService } from '../../manager/your-face/your-face.service.js';
import { PersonaResponse } from '../../model/persona/entities/persona.entity.js';
import { FACE_EMOTIONS } from '../../model/story/emotion.js';
import type { FaceEmotion } from '../../model/story/emotion.js';
import { StoryDetail } from '../../manager/story/story.service.js';
import { ExpressionDrawingResponseBodyDTO, StartExpressionDrawingRequestBodyDTO } from '../expression/dto/expression-drawing.dto.js';
import { UploadExpressionRequestBodyDTO } from '../expression/dto/expression.request.dto.js';
import { MAX_UPLOAD_MB, UploadTooLargeFilter } from '../expression/expression.controller.js';
import { PersonaResponseBodyDTO } from '../persona/dto/persona.response.dto.js';
import { PortraitCropRequestBodyDTO } from '../reference-image/dto/portrait-crop.request.dto.js';
import { StoryResponseBodyDTO } from '../story/dto/story.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);
const Emotion = () => Param('emotion', new ParseEnumPipe(Object.fromEntries(FACE_EMOTIONS.map((emotion) => [emotion, emotion]))));

interface UploadedImage {
    buffer: Buffer;
}

const DRAW =
    'Drawn from its picture (the Role image or Persona image) at the Expression price, replacing any there and keeping its square, then cut out. ' +
    'Refused before any call without a picture (409.003.023) or with the Venice pool used up (402.001.004).';

const UPLOAD_CUTOUT =
    "Keeps an uploaded see-through PNG or WebP as the Expression's cut-out for the Visual novel stage, replacing any there; free. " +
    'Refused without the Expression (404), or for a picture with no see-through pixel (415.002.014).';

const asStory = (answer: Promise<StoryDetail | PersonaResponse>) => answer as Promise<StoryResponseBodyDTO>;
const asPersona = (answer: Promise<StoryDetail | PersonaResponse>) => answer as Promise<PersonaResponseBodyDTO>;

/** The Role's Expressions (.scratch/your-faces/spec.md). Every write answers the whole Story, whose Role lists its `expressions`. */
@ApiTags('Your faces')
@ApiParam({ name: 'emotion', enum: FACE_EMOTIONS })
@Controller('stories/:storyId/role/expressions/:emotion')
export class RoleExpressionApiController {
    constructor(private readonly faces: YourFaceManagerService) {}

    @Post('draw')
    @ApiCreatedResponse({ type: StoryResponseBodyDTO, description: DRAW })
    draw(@Id('storyId') storyId: number, @Emotion() emotion: FaceEmotion): Promise<StoryResponseBodyDTO> {
        return asStory(this.faces.draw({ storyId }, emotion));
    }

    @Post('cutout')
    @ApiCreatedResponse({ type: StoryResponseBodyDTO, description: 'Takes the background away for the Visual novel stage.' })
    cutOut(@Id('storyId') storyId: number, @Emotion() emotion: FaceEmotion): Promise<StoryResponseBodyDTO> {
        return asStory(this.faces.cutOut({ storyId }, emotion));
    }

    @Put()
    @UseFilters(UploadTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UploadExpressionRequestBodyDTO })
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: "The picture is now the emotion's Expression, with the centre square." })
    upload(@Id('storyId') storyId: number, @Emotion() emotion: FaceEmotion, @UploadedFile() file: UploadedImage | undefined): Promise<StoryResponseBodyDTO> {
        if (!file) throw new NoImageFileError();
        return asStory(this.faces.upload({ storyId }, emotion, file.buffer));
    }

    @Put('cutout')
    @UseFilters(UploadTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UploadExpressionRequestBodyDTO })
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: UPLOAD_CUTOUT })
    uploadCutout(@Id('storyId') storyId: number, @Emotion() emotion: FaceEmotion, @UploadedFile() file: UploadedImage | undefined): Promise<StoryResponseBodyDTO> {
        if (!file) throw new NoImageFileError();
        return asStory(this.faces.uploadCutout({ storyId }, emotion, file.buffer));
    }

    @Delete()
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    remove(@Id('storyId') storyId: number, @Emotion() emotion: FaceEmotion): Promise<StoryResponseBodyDTO> {
        return asStory(this.faces.remove({ storyId }, emotion));
    }

    @Put('crop')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    setCrop(@Id('storyId') storyId: number, @Emotion() emotion: FaceEmotion, @Body() body: PortraitCropRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return asStory(this.faces.setCrop({ storyId }, emotion, body));
    }

    @Delete('crop')
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'Back to the centre square.' })
    clearCrop(@Id('storyId') storyId: number, @Emotion() emotion: FaceEmotion): Promise<StoryResponseBodyDTO> {
        return asStory(this.faces.setCrop({ storyId }, emotion, null));
    }
}

/** Draw all for the Role (.scratch/your-faces/spec.md), as for a Character. */
@ApiTags('Your faces')
@Controller('stories/:storyId/role/expression-drawing')
export class RoleExpressionDrawingApiController {
    constructor(private readonly faces: YourFaceManagerService) {}

    @Post()
    @ApiCreatedResponse({ type: ExpressionDrawingResponseBodyDTO })
    start(@Id('storyId') storyId: number, @Body() body: StartExpressionDrawingRequestBodyDTO): Promise<ExpressionDrawingResponseBodyDTO> {
        return this.faces.startDrawing({ storyId }, body.redraw ?? false);
    }

    @Get()
    @ApiOkResponse({ type: ExpressionDrawingResponseBodyDTO })
    status(@Id('storyId') storyId: number): Promise<ExpressionDrawingResponseBodyDTO> {
        return this.faces.drawing({ storyId });
    }

    @Delete()
    @ApiOkResponse({ type: ExpressionDrawingResponseBodyDTO, description: 'Stops the run after the drawing under way, which is paid for already; answers the run, or an idle one when there is none.' })
    stop(@Id('storyId') storyId: number): Promise<ExpressionDrawingResponseBodyDTO> {
        return this.faces.stopDrawing({ storyId });
    }
}

/** A Persona's Expressions (.scratch/your-faces/spec.md). Every write answers the Persona, which lists its `expressions`. */
@ApiTags('Your faces')
@ApiParam({ name: 'emotion', enum: FACE_EMOTIONS })
@Controller('personas/:personaId/expressions/:emotion')
export class PersonaExpressionApiController {
    constructor(private readonly faces: YourFaceManagerService) {}

    @Post('draw')
    @ApiCreatedResponse({ type: PersonaResponseBodyDTO, description: DRAW })
    draw(@Id('personaId') personaId: number, @Emotion() emotion: FaceEmotion): Promise<PersonaResponseBodyDTO> {
        return asPersona(this.faces.draw({ personaId }, emotion));
    }

    @Post('cutout')
    @ApiCreatedResponse({ type: PersonaResponseBodyDTO })
    cutOut(@Id('personaId') personaId: number, @Emotion() emotion: FaceEmotion): Promise<PersonaResponseBodyDTO> {
        return asPersona(this.faces.cutOut({ personaId }, emotion));
    }

    @Put()
    @UseFilters(UploadTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UploadExpressionRequestBodyDTO })
    @ApiOkResponse({ type: PersonaResponseBodyDTO })
    upload(@Id('personaId') personaId: number, @Emotion() emotion: FaceEmotion, @UploadedFile() file: UploadedImage | undefined): Promise<PersonaResponseBodyDTO> {
        if (!file) throw new NoImageFileError();
        return asPersona(this.faces.upload({ personaId }, emotion, file.buffer));
    }

    @Put('cutout')
    @UseFilters(UploadTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UploadExpressionRequestBodyDTO })
    @ApiOkResponse({ type: PersonaResponseBodyDTO, description: UPLOAD_CUTOUT })
    uploadCutout(@Id('personaId') personaId: number, @Emotion() emotion: FaceEmotion, @UploadedFile() file: UploadedImage | undefined): Promise<PersonaResponseBodyDTO> {
        if (!file) throw new NoImageFileError();
        return asPersona(this.faces.uploadCutout({ personaId }, emotion, file.buffer));
    }

    @Delete()
    @ApiOkResponse({ type: PersonaResponseBodyDTO })
    remove(@Id('personaId') personaId: number, @Emotion() emotion: FaceEmotion): Promise<PersonaResponseBodyDTO> {
        return asPersona(this.faces.remove({ personaId }, emotion));
    }

    @Put('crop')
    @ApiOkResponse({ type: PersonaResponseBodyDTO })
    setCrop(@Id('personaId') personaId: number, @Emotion() emotion: FaceEmotion, @Body() body: PortraitCropRequestBodyDTO): Promise<PersonaResponseBodyDTO> {
        return asPersona(this.faces.setCrop({ personaId }, emotion, body));
    }

    @Delete('crop')
    @ApiOkResponse({ type: PersonaResponseBodyDTO })
    clearCrop(@Id('personaId') personaId: number, @Emotion() emotion: FaceEmotion): Promise<PersonaResponseBodyDTO> {
        return asPersona(this.faces.setCrop({ personaId }, emotion, null));
    }
}

/** Draw all for a Persona. */
@ApiTags('Your faces')
@Controller('personas/:personaId/expression-drawing')
export class PersonaExpressionDrawingApiController {
    constructor(private readonly faces: YourFaceManagerService) {}

    @Post()
    @ApiCreatedResponse({ type: ExpressionDrawingResponseBodyDTO })
    start(@Id('personaId') personaId: number, @Body() body: StartExpressionDrawingRequestBodyDTO): Promise<ExpressionDrawingResponseBodyDTO> {
        return this.faces.startDrawing({ personaId }, body.redraw ?? false);
    }

    @Get()
    @ApiOkResponse({ type: ExpressionDrawingResponseBodyDTO })
    status(@Id('personaId') personaId: number): Promise<ExpressionDrawingResponseBodyDTO> {
        return this.faces.drawing({ personaId });
    }

    @Delete()
    @ApiOkResponse({ type: ExpressionDrawingResponseBodyDTO, description: 'Stops the run after the drawing under way, which is paid for already; answers the run, or an idle one when there is none.' })
    stop(@Id('personaId') personaId: number): Promise<ExpressionDrawingResponseBodyDTO> {
        return this.faces.stopDrawing({ personaId });
    }
}

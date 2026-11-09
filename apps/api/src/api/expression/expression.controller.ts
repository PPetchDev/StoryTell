import {
    ArgumentsHost,
    Body,
    Catch,
    Controller,
    Delete,
    ExceptionFilter,
    Param,
    ParseEnumPipe,
    ParseIntPipe,
    PayloadTooLargeException,
    Post,
    Put,
    UploadedFile,
    UseFilters,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';

import { ImageTooLargeError, NoImageFileError } from '../../errors/image.errors.js';
import { AppErrorFilter } from '../../filter/app-error.filter.js';
import { ExpressionManagerService } from '../../manager/expression/expression.service.js';
import { EXPRESSION_EMOTIONS } from '../../model/story/emotion.js';
import type { ExpressionEmotion } from '../../model/story/emotion.js';
import { PortraitCropRequestBodyDTO } from '../reference-image/dto/portrait-crop.request.dto.js';
import { StoryResponseBodyDTO } from '../story/dto/story.response.dto.js';
import { UploadExpressionRequestBodyDTO } from './dto/expression.request.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/** One of the seven emotions with a picture; anything else, `neutral` included, is a 400. */
const Emotion = () =>
    Param('emotion', new ParseEnumPipe(Object.fromEntries(EXPRESSION_EMOTIONS.map((emotion) => [emotion, emotion]))));

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

/**
 * A Character's Expressions (.scratch/expressions/spec.md, "Authoring API"): one picture per
 * emotion, drawn from the Reference image or uploaded, with its own square or the Portrait's, and removed. Every write answers the
 * whole Story, whose Characters list their `expressions`.
 */
@ApiTags('Expressions')
@ApiParam({ name: 'emotion', enum: EXPRESSION_EMOTIONS })
@Controller('stories/:storyId/characters/:characterId/expressions/:emotion')
export class ExpressionApiController {
    constructor(private readonly expressions: ExpressionManagerService) {}

    @Post('draw')
    @ApiCreatedResponse({
        type: StoryResponseBodyDTO,
        description:
            "Drawn from the Reference image with the Settings Snapshot model at its 1K price, replacing any there and keeping its square. " +
            'Refused before any call without a Reference image (409.003.023) or with the Venice pool used up (402.001.004).',
    })
    draw(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Emotion() emotion: ExpressionEmotion,
    ): Promise<StoryResponseBodyDTO> {
        return this.expressions.draw(storyId, characterId, emotion);
    }

    @Put()
    @UseFilters(UploadTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UploadExpressionRequestBodyDTO })
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: "The picture is now the emotion's Expression, replacing any there, with the Portrait's square." })
    upload(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Emotion() emotion: ExpressionEmotion,
        @UploadedFile() file: UploadedImage | undefined,
    ): Promise<StoryResponseBodyDTO> {
        if (!file) throw new NoImageFileError();
        return this.expressions.upload(storyId, characterId, emotion, file.buffer);
    }

    @Delete()
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The Expression and its file are gone; the emotion shows the Portrait.' })
    remove(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Emotion() emotion: ExpressionEmotion,
    ): Promise<StoryResponseBodyDTO> {
        return this.expressions.remove(storyId, characterId, emotion);
    }

    @Put('crop')
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: "The Expression's own square, in fractions of its picture's width." })
    setCrop(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Emotion() emotion: ExpressionEmotion,
        @Body() body: PortraitCropRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.expressions.setCrop(storyId, characterId, emotion, body);
    }

    @Delete('crop')
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: "Back to the Portrait's square." })
    clearCrop(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Emotion() emotion: ExpressionEmotion,
    ): Promise<StoryResponseBodyDTO> {
        return this.expressions.setCrop(storyId, characterId, emotion, null);
    }
}

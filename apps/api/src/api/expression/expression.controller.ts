import {
    ArgumentsHost,
    Body,
    Catch,
    Controller,
    Delete,
    ExceptionFilter,
    Param,
    ParseEnumPipe,
    Query,
    ParseIntPipe,
    PayloadTooLargeException,
    Post,
    Put,
    UploadedFile,
    UseFilters,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { ImageTooLargeError, NoImageFileError } from '../../errors/image.errors.js';
import { AppErrorFilter } from '../../filter/app-error.filter.js';
import { ExpressionManagerService } from '../../manager/expression/expression.service.js';
import { EXPRESSION_EMOTIONS } from '../../model/story/emotion.js';
import { CUTOUT_MAKERS } from '../../service/model-gateway/model-gateway.js';
import type { CutoutMaker } from '../../service/model-gateway/model-gateway.js';
import type { ExpressionEmotion } from '../../model/story/emotion.js';
import { PortraitCropRequestBodyDTO } from '../reference-image/dto/portrait-crop.request.dto.js';
import { StoryResponseBodyDTO } from '../story/dto/story.response.dto.js';
import { UploadExpressionRequestBodyDTO } from './dto/expression.request.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/** One of the seven emotions with a picture; anything else, `neutral` included, is a 400. */
const Emotion = () =>
    Param('emotion', new ParseEnumPipe(Object.fromEntries(EXPRESSION_EMOTIONS.map((emotion) => [emotion, emotion]))));

export const MAX_UPLOAD_MB = 15;

/** The part of a multer file this controller reads. */
interface UploadedImage {
    buffer: Buffer;
}

/** Multer's size limit surfaces as Nest's 413; answer it with the typed domain error instead. */
@Catch(PayloadTooLargeException)
export class UploadTooLargeFilter implements ExceptionFilter {
    catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
        new AppErrorFilter().catch(new ImageTooLargeError(MAX_UPLOAD_MB), host);
    }
}

/** `?with=own|venice`: who makes the cut-out (.scratch/own-cutout/spec.md); left out, the app's own where it is set up. */
const With = () => Query('with', new ParseEnumPipe(Object.fromEntries(CUTOUT_MAKERS.map((maker) => [maker, maker])), { optional: true }));
const WITH_QUERY = { name: 'with', required: false, enum: [...CUTOUT_MAKERS], description: "Who makes the cut-out: the app's own background remover (free) or Venice's (paid). Left out: the app's own where it is set up, else Venice." };

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

    @Post('cutout')
    @ApiQuery(WITH_QUERY)
    @ApiCreatedResponse({
        type: StoryResponseBodyDTO,
        description:
            'Takes the background away from the Expression for the Visual novel stage (.scratch/stage-pictures/spec.md), and from the Reference image ' +
            'when it has no cut-out yet; a drawn Expression is cut out by itself. An Expression that has a cut-out gets a new one. Refused without the Expression (404), with the Venice pool used up when Venice makes it (402.001.004), or when the app\'s own remover is asked for where it is not set up (409.002.015).',
    })
    cutOut(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Emotion() emotion: ExpressionEmotion,
        @With() by: CutoutMaker | undefined,
    ): Promise<StoryResponseBodyDTO> {
        return this.expressions.cutOut(storyId, characterId, emotion, by);
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

    @Put('cutout')
    @UseFilters(UploadTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UploadExpressionRequestBodyDTO })
    @ApiOkResponse({
        type: StoryResponseBodyDTO,
        description:
            "Keeps an uploaded see-through PNG or WebP as the Expression's cut-out for the Visual novel stage, replacing any there; free. " +
            'Refused without the Expression (404), or for a picture with no see-through pixel (415.002.014).',
    })
    uploadCutout(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Emotion() emotion: ExpressionEmotion,
        @UploadedFile() file: UploadedImage | undefined,
    ): Promise<StoryResponseBodyDTO> {
        if (!file) throw new NoImageFileError();
        return this.expressions.uploadCutout(storyId, characterId, emotion, file.buffer);
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

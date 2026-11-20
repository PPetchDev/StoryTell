import {
    ArgumentsHost,
    Body,
    Catch,
    Controller,
    Delete,
    ExceptionFilter,
    Get,
    Param,
    ParseIntPipe,
    PayloadTooLargeException,
    Post,
    Put,
    Res,
    StreamableFile,
    UploadedFile,
    UseFilters,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ImageTooLargeError, NoImageFileError, UnsupportedImageError } from '../../errors/image.errors.js';
import { AppErrorFilter } from '../../filter/app-error.filter.js';
import { ImageStoreService } from '../../store/image/image-store.service.js';

import { ReferenceImageManagerService } from '../../manager/reference-image/reference-image.service.js';
import { StoryManagerService } from '../../manager/story/story.service.js';
import { StoryResponseBodyDTO } from '../story/dto/story.response.dto.js';
import { PortraitCropRequestBodyDTO } from './dto/portrait-crop.request.dto.js';
import { PickReferenceImageRequestBodyDTO } from './dto/reference-image.request.dto.js';
import { GenerateReferenceCandidatesResponseBodyDTO } from './dto/reference-image.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

const MAX_UPLOAD_MB = 15;

/** Multer's size limit surfaces as Nest's 413; answer it with the typed domain error instead. */
@Catch(PayloadTooLargeException)
class UploadTooLargeFilter implements ExceptionFilter {
    catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
        new AppErrorFilter().catch(new ImageTooLargeError(MAX_UPLOAD_MB), host);
    }
}

/**
 * A Character's Reference image (spec: "Reference image"): generate a round of candidates,
 * look at them, pick one, or remove the image. The picked image is served like any other by
 * `GET /api/images/{path}`, from the Character's `referenceImagePath`.
 */
@ApiTags('Reference images')
@Controller('stories/:storyId/characters/:characterId/reference-image')
export class ReferenceImageApiController {
    constructor(
        private readonly referenceImageManager: ReferenceImageManagerService,
        private readonly storyManager: StoryManagerService,
    ) {}

    @Post('candidates')
    @ApiCreatedResponse({
        type: GenerateReferenceCandidatesResponseBodyDTO,
        description: 'Up to 3 candidates, held until one is picked or a newer round replaces them.',
    })
    generateCandidates(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
    ): Promise<GenerateReferenceCandidatesResponseBodyDTO> {
        return this.referenceImageManager.generateCandidates(storyId, characterId);
    }

    @Get('candidates/:candidateId')
    @ApiParam({ name: 'candidateId', description: 'A candidate id from the latest round.' })
    @ApiProduces('image/png', 'image/jpeg', 'image/webp')
    @ApiOkResponse({ description: 'The candidate image.' })
    async candidate(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Param('candidateId') candidateId: string,
        @Res({ passthrough: true }) response: Response,
    ): Promise<StreamableFile> {
        const image = await this.referenceImageManager.openCandidate(storyId, characterId, candidateId);
        response.setHeader('Content-Type', image.mimeType);
        response.setHeader('Content-Length', image.bytes.length);
        // Candidates are one-off: a browser must not show a stale one under a reused id.
        response.setHeader('Cache-Control', 'no-store');
        return new StreamableFile(image.bytes);
    }

    @Put()
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The picked candidate is now the Reference image.' })
    pick(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Body() body: PickReferenceImageRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.referenceImageManager.pickCandidate(storyId, characterId, body.candidateId);
    }

    /**
     * A picture from the author's phone becomes the Reference image (.scratch/reference-upload/spec.md),
     * replacing the one before, as a picked candidate does. The type is read from the bytes.
     */
    @Put('upload')
    @UseFilters(UploadTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', required: ['image'], properties: { image: { type: 'string', format: 'binary', description: 'A PNG, JPEG or WebP of at most 15 MB.' } } } })
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The uploaded picture is now the Reference image.' })
    upload(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @UploadedFile() file: { buffer: Buffer } | undefined,
    ): Promise<StoryResponseBodyDTO> {
        if (!file) throw new NoImageFileError();
        const mimeType = ImageStoreService.sniffMimeType(file.buffer);
        if (!mimeType) throw new UnsupportedImageError();
        return this.storyManager.replaceReferenceImage(storyId, characterId, { bytes: file.buffer, mimeType });
    }

    @Delete()
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The Character has no Reference image again.' })
    remove(@Id('storyId') storyId: number, @Id('characterId') characterId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.removeReferenceImage(storyId, characterId);
    }

    @Put('portrait')
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The square of the Reference image shown beside their lines in a Chat.' })
    setPortrait(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Body() body: PortraitCropRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.storyManager.setPortraitCrop(storyId, characterId, body);
    }

    @Delete('portrait')
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'No square is chosen; the Chat centres the Reference image.' })
    clearPortrait(@Id('storyId') storyId: number, @Id('characterId') characterId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.setPortraitCrop(storyId, characterId, null);
    }
}

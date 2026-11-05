import {
    ArgumentsHost,
    Body,
    Catch,
    Controller,
    Delete,
    ExceptionFilter,
    Param,
    ParseIntPipe,
    PayloadTooLargeException,
    Put,
    UploadedFile,
    UseFilters,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ImageTooLargeError, NoImageFileError } from '../../errors/image.errors.js';
import { AppErrorFilter } from '../../filter/app-error.filter.js';
import { StoryManagerService } from '../../manager/story/story.service.js';
import { ChooseCoverRequestBodyDTO, CoverFocusRequestBodyDTO, UploadCoverRequestBodyDTO } from './dto/cover.request.dto.js';
import { StoryResponseBodyDTO } from './dto/story.response.dto.js';

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

/**
 * A Story's Cover: pick a Snapshot of its Gallery or a Character's Reference image, upload a
 * picture, move the focus point, or clear it. Every write answers with the whole Story, whose
 * `cover` is served like any image by `GET /api/images/{path}`.
 */
@ApiTags('Stories')
@Controller('stories/:storyId/cover')
export class StoryCoverApiController {
    constructor(private readonly storyManager: StoryManagerService) {}

    @Put()
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The Snapshot or Reference image is now the Cover.' })
    choose(@Id('storyId') storyId: number, @Body() body: ChooseCoverRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.chooseCover(storyId, body);
    }

    @Put('upload')
    @UseFilters(UploadTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: UploadCoverRequestBodyDTO })
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The uploaded picture is now the Cover, which owns its file.' })
    upload(
        @Id('storyId') storyId: number,
        @UploadedFile() file: UploadedImage | undefined,
    ): Promise<StoryResponseBodyDTO> {
        if (!file) throw new NoImageFileError();
        return this.storyManager.uploadCover(storyId, file.buffer);
    }

    @Delete()
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'No Cover again; an uploaded file is deleted.' })
    clear(@Id('storyId') storyId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.clearCover(storyId);
    }

    @Put('focus')
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The point of the Cover kept in view when a card crops it.' })
    setFocus(@Id('storyId') storyId: number, @Body() body: CoverFocusRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.storyManager.setCoverFocus(storyId, body);
    }

    @Delete('focus')
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'No focus point: the Cover is centred.' })
    clearFocus(@Id('storyId') storyId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.setCoverFocus(storyId, null);
    }
}

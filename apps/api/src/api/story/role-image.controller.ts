import {
    ArgumentsHost,
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
 * The Role's own picture (.scratch/role-image/spec.md): upload one, or clear it. Every write
 * answers with the whole Story, whose `role.imagePath` is served by `GET /api/images/{path}`.
 */
@ApiTags('Stories')
@Controller('stories/:storyId/role/image')
export class RoleImageApiController {
    constructor(private readonly storyManager: StoryManagerService) {}

    @Put()
    @UseFilters(UploadTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ schema: { type: 'object', required: ['image'], properties: { image: { type: 'string', format: 'binary', description: 'A PNG, JPEG or WebP of at most 15 MB.' } } } })
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: "The uploaded picture is now the Role's, which owns its file." })
    upload(@Id('storyId') storyId: number, @UploadedFile() file: UploadedImage | undefined): Promise<StoryResponseBodyDTO> {
        if (!file) throw new NoImageFileError();
        return this.storyManager.uploadRoleImage(storyId, file.buffer);
    }

    @Delete()
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The Role has no picture again; its file is deleted.' })
    clear(@Id('storyId') storyId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.clearRoleImage(storyId);
    }
}

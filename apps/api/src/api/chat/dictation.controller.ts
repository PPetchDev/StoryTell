import {
    ArgumentsHost,
    Body,
    Catch,
    Controller,
    ExceptionFilter,
    HttpCode,
    Param,
    ParseIntPipe,
    PayloadTooLargeException,
    Post,
    UploadedFile,
    UseFilters,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { AudioTooLargeError, NoAudioFileError } from '../../errors/audio.errors.js';
import { AppErrorFilter } from '../../filter/app-error.filter.js';
import { ChatManagerService } from '../../manager/chat/chat.service.js';
import { MAX_RECORDING_MB } from '../../manager/chat/dictation/recording.js';
import { DictationRequestBodyDTO, DictationResponseBodyDTO } from './dto/dictation.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/** The part of a multer file this controller reads. Multer keeps it in memory: it never touches disk. */
interface UploadedRecording {
    buffer: Buffer;
}

/** Multer's size limit surfaces as Nest's 413; answer it with the typed domain error instead. */
@Catch(PayloadTooLargeException)
class RecordingTooLargeFilter implements ExceptionFilter {
    catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
        new AppErrorFilter().catch(new AudioTooLargeError(MAX_RECORDING_MB), host);
    }
}

/** Dictation (.scratch/dictation/spec.md): a recording in, its text out, for the composer. */
@ApiTags('Chats')
@Controller('stories/:storyId/chats/:chatId/dictation')
export class DictationApiController {
    constructor(private readonly chatManager: ChatManagerService) {}

    @Post()
    @HttpCode(200)
    @UseFilters(RecordingTooLargeFilter)
    @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_RECORDING_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiBody({ type: DictationRequestBodyDTO })
    @ApiOkResponse({ type: DictationResponseBodyDTO, description: 'What was heard. Nothing is stored.' })
    dictate(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @UploadedFile() file: UploadedRecording | undefined,
        @Body() body: DictationRequestBodyDTO,
    ): Promise<DictationResponseBodyDTO> {
        if (!file) throw new NoAudioFileError();
        return this.chatManager.dictate(storyId, chatId, { bytes: file.buffer, language: body.language, durationMs: body.durationMs });
    }
}

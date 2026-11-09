import { Controller, Get, Header, HttpCode, Param, ParseIntPipe, Post, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';

import { ReadAloudManagerService } from '../../manager/read-aloud/read-aloud.service.js';
import { SpeechQueueResponseBodyDTO } from './dto/read-aloud.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/** Read aloud (.scratch/read-aloud/spec.md, "Audio cache"): an AI Message's play queue and each item's audio. */
@ApiTags('Chats')
@Controller('stories/:storyId/chats/:chatId/messages/:messageId/speech')
export class ReadAloudApiController {
    constructor(private readonly readAloud: ReadAloudManagerService) {}

    @Get()
    @ApiOkResponse({ type: SpeechQueueResponseBodyDTO, description: 'The queue as the Message reads now. Makes no call.' })
    async queue(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Id('messageId') messageId: number): Promise<SpeechQueueResponseBodyDTO> {
        return { items: await this.readAloud.queue(storyId, chatId, messageId) };
    }

    /** A POST because an item not yet on disk spends credit; one on disk is answered with no call. */
    @Post(':index')
    @HttpCode(200)
    @Header('Cache-Control', 'no-store')
    @ApiProduces('audio/mpeg')
    @ApiOkResponse({ description: "The item's audio as MP3: from disk when it is there, else made once and kept." })
    async item(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('messageId') messageId: number,
        @Id('index') index: number,
    ): Promise<StreamableFile> {
        return new StreamableFile(await this.readAloud.item(storyId, chatId, messageId, index), { type: 'audio/mpeg' });
    }
}

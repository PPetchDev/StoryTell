import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ChaptersManagerService } from '../../manager/chat/chapters/chapters.service.js';
import { ChatManagerService } from '../../manager/chat/chat.service.js';
import { ChatResponseBodyDTO } from '../chat/dto/chat.response.dto.js';
import { ChaptersResponseBodyDTO, MoveOnRequestBodyDTO, SaveChapterRequestBodyDTO } from './dto/chapters.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Move on, and Chapters (.scratch/scene-chapters/spec.md): the user ends the current Scene; each ended
 * Scene's Chapter is summarised in the background, and the user reads and edits it here.
 */
@ApiTags('Chapters')
@Controller('stories/:storyId/chats/:chatId')
export class ChaptersApiController {
    constructor(
        private readonly chatManager: ChatManagerService,
        private readonly chapters: ChaptersManagerService,
    ) {}

    @Post('scene')
    @HttpCode(200)
    @ApiOkResponse({ type: ChatResponseBodyDTO, description: 'The Chat, on its new Scene or in free play.' })
    moveOn(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Body() body: MoveOnRequestBodyDTO): Promise<ChatResponseBodyDTO> {
        return this.chatManager.moveOn(storyId, chatId, body.toSceneId);
    }

    @Get('chapters')
    @ApiOkResponse({ type: ChaptersResponseBodyDTO })
    list(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<ChaptersResponseBodyDTO> {
        return this.chapters.list(storyId, chatId);
    }

    @Put('chapters/:chapterId')
    @ApiOkResponse({ type: ChaptersResponseBodyDTO, description: "Saved as the user's summary." })
    save(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('chapterId') chapterId: number,
        @Body() body: SaveChapterRequestBodyDTO,
    ): Promise<ChaptersResponseBodyDTO> {
        return this.chapters.save(storyId, chatId, chapterId, body.text);
    }

    /** Writes a failed Chapter again, in the background; the list shows it being written. */
    @Post('chapters/:chapterId/write')
    @HttpCode(200)
    @ApiOkResponse({ type: ChaptersResponseBodyDTO })
    retry(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Id('chapterId') chapterId: number): Promise<ChaptersResponseBodyDTO> {
        return this.chapters.retry(storyId, chatId, chapterId);
    }
}

import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { MemoryManagerService } from '../../manager/chat/memory/memory.service.js';
import { AddMemoryRequestBodyDTO, EditMemoryRequestBodyDTO } from './dto/memory.request.dto.js';
import { MemoryListResponseBodyDTO, MemoryResponseBodyDTO } from './dto/memory.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Memory per Chat (spec: "API surface"): list (active and archived), add, edit, delete,
 * restore. These are the user's own actions, never tied to a Message and never rolled back
 * by an edit; the AI's changes come through extraction and the ledger.
 */
@ApiTags('Memory')
@Controller('stories/:storyId/chats/:chatId/memories')
export class MemoryApiController {
    constructor(private readonly memoryManager: MemoryManagerService) {}

    @Get()
    @ApiOkResponse({ type: MemoryListResponseBodyDTO })
    list(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<MemoryListResponseBodyDTO> {
        return this.memoryManager.list(storyId, chatId);
    }

    /** Adds a Memory the user wrote. It is locked, and known by the Characters present unless `knownBy` says otherwise. */
    @Post()
    @ApiCreatedResponse({ type: MemoryResponseBodyDTO })
    add(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: AddMemoryRequestBodyDTO,
    ): Promise<MemoryResponseBodyDTO> {
        return this.memoryManager.add(storyId, chatId, body.text, body.knownBy);
    }

    /** Edits the text or the Known-by set. The Memory is locked from AI changes afterwards. */
    @Patch(':memoryId')
    @ApiOkResponse({ type: MemoryResponseBodyDTO })
    edit(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('memoryId') memoryId: number,
        @Body() body: EditMemoryRequestBodyDTO,
    ): Promise<MemoryResponseBodyDTO> {
        return this.memoryManager.edit(storyId, chatId, memoryId, body);
    }

    @Delete(':memoryId')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'The Memory is gone.' })
    remove(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Id('memoryId') memoryId: number): Promise<void> {
        return this.memoryManager.remove(storyId, chatId, memoryId);
    }

    /** Brings an archived Memory back into play, locked. */
    @Post(':memoryId/restore')
    @HttpCode(200)
    @ApiOkResponse({ type: MemoryResponseBodyDTO })
    restore(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('memoryId') memoryId: number,
    ): Promise<MemoryResponseBodyDTO> {
        return this.memoryManager.restore(storyId, chatId, memoryId);
    }
}

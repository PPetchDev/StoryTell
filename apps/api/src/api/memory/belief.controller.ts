import { Body, Controller, Delete, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { BeliefManagerService } from '../../manager/chat/memory/belief.service.js';
import { AddBeliefRequestBodyDTO, EditBeliefRequestBodyDTO } from './dto/belief.request.dto.js';
import { BeliefResponseBodyDTO } from './dto/belief.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Beliefs per Chat (.scratch/memory-by-meaning/spec.md, "API"): add, edit and delete. Read with the
 * Chat (and the Memory list). The user's own actions, never tied to a Message and never rolled back
 * by an edit; the AI's changes come through extraction and the ledger.
 */
@ApiTags('Memory')
@Controller('stories/:storyId/chats/:chatId/beliefs')
export class BeliefApiController {
    constructor(private readonly beliefManager: BeliefManagerService) {}

    /** Adds a Belief the user wrote, held by one Character, optionally contradicting one of the Chat's Memories. */
    @Post()
    @ApiCreatedResponse({ type: BeliefResponseBodyDTO })
    add(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Body() body: AddBeliefRequestBodyDTO): Promise<BeliefResponseBodyDTO> {
        return this.beliefManager.add(storyId, chatId, body);
    }

    /** Edits who holds it, its text, or the Memory it contradicts (null takes the link off). */
    @Patch(':beliefId')
    @ApiOkResponse({ type: BeliefResponseBodyDTO })
    edit(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('beliefId') beliefId: number,
        @Body() body: EditBeliefRequestBodyDTO,
    ): Promise<BeliefResponseBodyDTO> {
        return this.beliefManager.edit(storyId, chatId, beliefId, body);
    }

    @Delete(':beliefId')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'The Belief is gone.' })
    remove(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Id('beliefId') beliefId: number): Promise<void> {
        return this.beliefManager.remove(storyId, chatId, beliefId);
    }
}

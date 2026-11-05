import { Body, Controller, Get, Param, ParseIntPipe, Put } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { StorySoFarManagerService } from '../../manager/chat/story-so-far/story-so-far.service.js';
import { SaveStorySoFarRequestBodyDTO, StorySoFarResponseBodyDTO } from './dto/story-so-far.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * A Chat's Story so far (spec: "Story so far"): read it, or save the user's own text. The AI
 * writes it in the background after a turn; there is nothing to call to make it run.
 */
@ApiTags('Story so far')
@Controller('stories/:storyId/chats/:chatId/story-so-far')
export class StorySoFarApiController {
    constructor(private readonly storySoFar: StorySoFarManagerService) {}

    @Get()
    @ApiOkResponse({ type: StorySoFarResponseBodyDTO })
    get(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<StorySoFarResponseBodyDTO> {
        return this.storySoFar.get(storyId, chatId);
    }

    @Put()
    @ApiOkResponse({ type: StorySoFarResponseBodyDTO, description: "Saved as the user's text; refused while the Chat has none yet." })
    save(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: SaveStorySoFarRequestBodyDTO,
    ): Promise<StorySoFarResponseBodyDTO> {
        return this.storySoFar.save(storyId, chatId, body.text);
    }
}

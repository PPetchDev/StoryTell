import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ReplyCostManagerService } from '../../manager/usage/reply-cost.service.js';
import { ChatCostsResponseBodyDTO } from './dto/reply-cost.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * What each reply of a Chat cost (.scratch/cost-view/spec.md): the turn and the background calls
 * it caused. The Chat reads it only while "Show cost per reply" is on.
 */
@ApiTags('Usage')
@Controller('stories/:storyId/chats/:chatId/costs')
export class ReplyCostApiController {
    constructor(private readonly replyCosts: ReplyCostManagerService) {}

    @Get()
    @ApiOkResponse({ type: ChatCostsResponseBodyDTO })
    ofChat(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<ChatCostsResponseBodyDTO> {
        return this.replyCosts.ofChat(storyId, chatId);
    }
}

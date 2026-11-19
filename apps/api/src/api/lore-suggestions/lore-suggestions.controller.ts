import { Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { LoreSuggestionsManagerService } from '../../manager/lore-suggestions/lore-suggestions.service.js';
import { LoreSuggestionsResponseBodyDTO } from './dto/lore-suggestions.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Lore from a Chat (.scratch/lore-from-chat/spec.md): new Lore entries suggested from what the Chat
 * has established about the world. One background call; nothing is stored or added.
 */
@ApiTags('Lore from a Chat')
@Controller('stories/:storyId/chats/:chatId/lore-suggestions')
export class LoreSuggestionsApiController {
    constructor(private readonly suggestions: LoreSuggestionsManagerService) {}

    @Post()
    @HttpCode(200)
    @ApiOkResponse({ type: LoreSuggestionsResponseBodyDTO })
    async suggest(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<LoreSuggestionsResponseBodyDTO> {
        return { suggestions: await this.suggestions.suggest(storyId, chatId) };
    }
}

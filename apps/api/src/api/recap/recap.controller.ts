import { Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RecapManagerService } from '../../manager/recap/recap.service.js';
import { RecapResponseBodyDTO } from './dto/recap.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * "Previously on…" (.scratch/previously-on/spec.md): a short recap of where a Chat's story stands,
 * shown when the user comes back after a while away, or when they ask for it from the Chat menu.
 */
@ApiTags('Previously on')
@Controller('stories/:storyId/chats/:chatId/recap')
export class RecapApiController {
    constructor(private readonly recaps: RecapManagerService) {}

    @Get()
    @ApiOkResponse({ type: RecapResponseBodyDTO, description: 'Whether a Recap is due, and the stored one. No model call.' })
    get(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<RecapResponseBodyDTO> {
        return this.recaps.get(storyId, chatId);
    }

    /** Writes the Recap for the newest Message, unless one is stored. */
    @Post()
    @HttpCode(200)
    @ApiOkResponse({ type: RecapResponseBodyDTO })
    write(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<RecapResponseBodyDTO> {
        return this.recaps.write(storyId, chatId);
    }

    @Post('dismiss')
    @HttpCode(200)
    @ApiOkResponse({ type: RecapResponseBodyDTO, description: 'Put away until the next gap.' })
    dismiss(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<RecapResponseBodyDTO> {
        return this.recaps.dismiss(storyId, chatId);
    }
}

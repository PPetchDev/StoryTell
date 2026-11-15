import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { StoryManagerService } from '../../manager/story/story.service.js';
import { ListLoreSetsResponseBodyDTO } from './dto/story.response.dto.js';

/**
 * .scratch/shared-lore/spec.md: the Account's Lore sets, for a Story's picker. A set is made,
 * changed and deleted through a Story that links it (see the Story controller).
 */
@ApiTags('Stories')
@Controller('lore-sets')
export class LoreSetApiController {
    constructor(private readonly storyManager: StoryManagerService) {}

    @Get()
    @ApiOkResponse({ type: ListLoreSetsResponseBodyDTO })
    async list(): Promise<ListLoreSetsResponseBodyDTO> {
        return { loreSets: await this.storyManager.listLoreSets() };
    }
}

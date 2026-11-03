import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { StoryManagerService } from '../../manager/story/story.service.js';
import { ListStoriesResponseBodyDTO } from './dto/story.response.dto.js';

@ApiTags('Stories')
@Controller('stories')
export class StoryApiController {
    constructor(private readonly storyManager: StoryManagerService) {}

    @Get()
    @ApiOkResponse({ type: ListStoriesResponseBodyDTO })
    async list(): Promise<ListStoriesResponseBodyDTO> {
        return { stories: await this.storyManager.listStories() };
    }
}

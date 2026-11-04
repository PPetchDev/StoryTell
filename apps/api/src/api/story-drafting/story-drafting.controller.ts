import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { StoryDraftingManagerService } from '../../manager/story-drafting/story-drafting.service.js';
import { StoryResponseBodyDTO } from '../story/dto/story.response.dto.js';
import { DraftStoryRequestBodyDTO, RewriteFieldRequestBodyDTO } from './dto/story-drafting.request.dto.js';

/**
 * AI drafting on top of the Story authoring routes (spec: "Story drafting and assistant").
 * Both answer with the whole Story and its playable status, like every authoring write.
 */
@ApiTags('Stories')
@Controller('stories')
export class StoryDraftingApiController {
    constructor(private readonly drafting: StoryDraftingManagerService) {}

    @Post('draft')
    @ApiCreatedResponse({ type: StoryResponseBodyDTO, description: 'The drafted Story, saved.' })
    draft(@Body() body: DraftStoryRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.drafting.draftStory(body.idea);
    }

    @Post(':storyId/rewrite')
    @HttpCode(200)
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The Story with only that field changed.' })
    rewrite(
        @Param('storyId', ParseIntPipe) storyId: number,
        @Body() body: RewriteFieldRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.drafting.rewriteField(storyId, body);
    }
}

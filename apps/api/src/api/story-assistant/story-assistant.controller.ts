import { Body, Controller, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { StoryAssistantManagerService } from '../../manager/story-assistant/story-assistant.service.js';
import { ApplyChangeSetRequestBodyDTO, InstructStoryRequestBodyDTO } from './dto/story-assistant.request.dto.js';
import { AssistantResponseBodyDTO } from './dto/story-assistant.response.dto.js';

/**
 * The Story assistant (spec: "Story assistant"): one instruction, one call, the changes
 * applied straight to the Story. Removals are applied only once confirmed, through `apply`.
 */
@ApiTags('Stories')
@Controller('stories')
export class StoryAssistantApiController {
    constructor(private readonly assistant: StoryAssistantManagerService) {}

    @Post(':storyId/assistant')
    @HttpCode(200)
    @ApiOkResponse({
        type: AssistantResponseBodyDTO,
        description: 'The Story with the changes applied and the list of them, or the change set pending confirmation.',
    })
    instruct(
        @Param('storyId', ParseIntPipe) storyId: number,
        @Body() body: InstructStoryRequestBodyDTO,
    ): Promise<AssistantResponseBodyDTO> {
        return this.assistant.instruct(storyId, body);
    }

    @Post(':storyId/assistant/apply')
    @HttpCode(200)
    @ApiOkResponse({ type: AssistantResponseBodyDTO, description: 'The Story with the change set applied.' })
    apply(
        @Param('storyId', ParseIntPipe) storyId: number,
        @Body() body: ApplyChangeSetRequestBodyDTO,
    ): Promise<AssistantResponseBodyDTO> {
        return this.assistant.applyChangeSet(storyId, body);
    }
}

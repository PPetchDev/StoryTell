import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { SavedReplyManagerService } from '../../manager/saved-reply/saved-reply.service.js';
import { StoryResponseBodyDTO } from '../story/dto/story.response.dto.js';
import { SavedReplyRequestBodyDTO } from './dto/saved-reply.request.dto.js';
import { ListSavedRepliesResponseBodyDTO } from './dto/saved-reply.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/** App-wide Saved replies (.scratch/saved-replies-and-replace-rules/spec.md). Each answers the app-wide list. */
@ApiTags('Saved replies')
@Controller('saved-replies')
export class SavedReplyApiController {
    constructor(private readonly savedReplies: SavedReplyManagerService) {}

    @Get()
    @ApiOkResponse({ type: ListSavedRepliesResponseBodyDTO })
    async list(): Promise<ListSavedRepliesResponseBodyDTO> {
        return { savedReplies: await this.savedReplies.listAppWide() };
    }

    @Post()
    @ApiCreatedResponse({ type: ListSavedRepliesResponseBodyDTO })
    async add(@Body() body: SavedReplyRequestBodyDTO): Promise<ListSavedRepliesResponseBodyDTO> {
        return { savedReplies: await this.savedReplies.addAppWide(body.text) };
    }

    @Patch(':savedReplyId')
    @ApiOkResponse({ type: ListSavedRepliesResponseBodyDTO })
    async update(@Id('savedReplyId') id: number, @Body() body: SavedReplyRequestBodyDTO): Promise<ListSavedRepliesResponseBodyDTO> {
        return { savedReplies: await this.savedReplies.updateAppWide(id, body.text) };
    }

    @Delete(':savedReplyId')
    @ApiOkResponse({ type: ListSavedRepliesResponseBodyDTO })
    async remove(@Id('savedReplyId') id: number): Promise<ListSavedRepliesResponseBodyDTO> {
        return { savedReplies: await this.savedReplies.removeAppWide(id) };
    }
}

/** A Story's own Saved replies, like Lore: each answers the whole Story. */
@ApiTags('Saved replies')
@Controller('stories/:storyId/saved-replies')
export class StorySavedReplyApiController {
    constructor(private readonly savedReplies: SavedReplyManagerService) {}

    @Post()
    @ApiCreatedResponse({ type: StoryResponseBodyDTO })
    add(@Id('storyId') storyId: number, @Body() body: SavedReplyRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.savedReplies.addToStory(storyId, body.text);
    }

    @Patch(':savedReplyId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    update(
        @Id('storyId') storyId: number,
        @Id('savedReplyId') id: number,
        @Body() body: SavedReplyRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.savedReplies.updateInStory(storyId, id, body.text);
    }

    @Delete(':savedReplyId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    remove(@Id('storyId') storyId: number, @Id('savedReplyId') id: number): Promise<StoryResponseBodyDTO> {
        return this.savedReplies.removeFromStory(storyId, id);
    }
}

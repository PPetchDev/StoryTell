import { Controller, Delete, Get, Param, ParseIntPipe, Put, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ChatSearchManagerService } from '../../manager/chat/search/chat-search.service.js';
import { BookmarksResponseBodyDTO, SearchChatQueryDTO, SearchChatResponseBodyDTO } from './dto/chat-search.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/** .scratch/chat-search/spec.md: search within a Chat, and its Bookmarks. Its own controller, beside the play endpoints. */
@ApiTags('Chats')
@Controller('stories/:storyId/chats')
export class ChatSearchApiController {
    constructor(private readonly search: ChatSearchManagerService) {}

    @Get(':chatId/search')
    @ApiOkResponse({ type: SearchChatResponseBodyDTO })
    find(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Query() query: SearchChatQueryDTO): Promise<SearchChatResponseBodyDTO> {
        return this.search.search(storyId, chatId, query.q);
    }

    @Get(':chatId/bookmarks')
    @ApiOkResponse({ type: BookmarksResponseBodyDTO })
    async bookmarks(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<BookmarksResponseBodyDTO> {
        return { bookmarks: await this.search.bookmarks(storyId, chatId) };
    }

    @Put(':chatId/messages/:messageId/bookmark')
    @ApiOkResponse({ type: BookmarksResponseBodyDTO, description: "The Chat's Bookmarks after marking. Marking a marked Message changes nothing." })
    async mark(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Id('messageId') messageId: number): Promise<BookmarksResponseBodyDTO> {
        return { bookmarks: await this.search.setBookmark(storyId, chatId, messageId, true) };
    }

    @Delete(':chatId/messages/:messageId/bookmark')
    @ApiOkResponse({ type: BookmarksResponseBodyDTO, description: "The Chat's Bookmarks after unmarking. Unmarking an unmarked Message changes nothing." })
    async unmark(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Id('messageId') messageId: number): Promise<BookmarksResponseBodyDTO> {
        return { bookmarks: await this.search.setBookmark(storyId, chatId, messageId, false) };
    }
}

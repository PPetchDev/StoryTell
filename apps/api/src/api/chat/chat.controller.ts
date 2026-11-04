import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { ChatManagerService } from '../../manager/chat/chat.service.js';
import { EditMessageRequestBodyDTO, RenameChatRequestBodyDTO, SendMessageRequestBodyDTO } from './dto/chat.request.dto.js';
import {
    ChatDashboardResponseBodyDTO,
    ChatResponseBodyDTO,
    EditMessageResponseBodyDTO,
    ListChatsResponseBodyDTO,
} from './dto/chat.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Chats per Story: create, list, rename, reset, delete, send, retry, edit a Message, the
 * read-only dashboard and a judge retry (spec: "API surface").
 */
@ApiTags('Chats')
@Controller('stories/:storyId/chats')
export class ChatApiController {
    constructor(private readonly chatManager: ChatManagerService) {}

    @Get()
    @ApiOkResponse({ type: ListChatsResponseBodyDTO })
    async list(@Id('storyId') storyId: number): Promise<ListChatsResponseBodyDTO> {
        return { chats: await this.chatManager.listChats(storyId) };
    }

    @Post()
    @ApiCreatedResponse({ type: ChatResponseBodyDTO })
    create(@Id('storyId') storyId: number): Promise<ChatResponseBodyDTO> {
        return this.chatManager.createChat(storyId);
    }

    @Get(':chatId')
    @ApiOkResponse({ type: ChatResponseBodyDTO })
    get(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<ChatResponseBodyDTO> {
        return this.chatManager.getChat(storyId, chatId);
    }

    @Patch(':chatId')
    @ApiOkResponse({ type: ChatResponseBodyDTO })
    rename(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: RenameChatRequestBodyDTO,
    ): Promise<ChatResponseBodyDTO> {
        return this.chatManager.renameChat(storyId, chatId, body.title);
    }

    @Delete(':chatId')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'The Chat and its Messages are gone.' })
    remove(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<void> {
        return this.chatManager.deleteChat(storyId, chatId);
    }

    /** Stores the User Message and writes the turn. On a failed turn the error is the gateway's. */
    @Post(':chatId/messages')
    @ApiCreatedResponse({ type: ChatResponseBodyDTO })
    send(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: SendMessageRequestBodyDTO,
    ): Promise<ChatResponseBodyDTO> {
        return this.chatManager.send(storyId, chatId, body.text);
    }

    @Post(':chatId/retry')
    @HttpCode(200)
    @ApiOkResponse({ type: ChatResponseBodyDTO })
    retry(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<ChatResponseBodyDTO> {
        return this.chatManager.retry(storyId, chatId);
    }

    /**
     * Rewrites a Message, deletes every Message after it and rolls back the changes they
     * caused. A User Message gets a fresh reply (on a failed turn the error is the
     * gateway's); an AI Message is re-split from its `@Name:` text, judged again, and no
     * turn runs.
     */
    @Patch(':chatId/messages/:messageId')
    @ApiOkResponse({ type: EditMessageResponseBodyDTO })
    editMessage(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('messageId') messageId: number,
        @Body() body: EditMessageRequestBodyDTO,
    ): Promise<EditMessageResponseBodyDTO> {
        return this.chatManager.editMessage(storyId, chatId, messageId, body.text);
    }

    /** Spec: "Dashboard (read-only)". Bonds with history, Arc steps, the Scene and background status. */
    @Get(':chatId/dashboard')
    @ApiOkResponse({ type: ChatDashboardResponseBodyDTO })
    dashboard(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<ChatDashboardResponseBodyDTO> {
        return this.chatManager.dashboard(storyId, chatId);
    }

    /** Runs the failed Bond, Arc and Scene judge of the latest AI Message again, and only that. */
    @Post(':chatId/messages/:messageId/judge')
    @HttpCode(200)
    @ApiOkResponse({ type: ChatDashboardResponseBodyDTO })
    retryJudge(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('messageId') messageId: number,
    ): Promise<ChatDashboardResponseBodyDTO> {
        return this.chatManager.retryJudge(storyId, chatId, messageId);
    }

    /** Clears every Message and copies the current Opening in again; title and identity stay. */
    @Post(':chatId/reset')
    @HttpCode(200)
    @ApiOkResponse({ type: ChatResponseBodyDTO })
    reset(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<ChatResponseBodyDTO> {
        return this.chatManager.resetChat(storyId, chatId);
    }
}

import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { ChatManagerService } from '../../manager/chat/chat.service.js';
import {
    ChooseReplyVersionRequestBodyDTO,
    EditMessageRequestBodyDTO,
    RenameChatRequestBodyDTO,
    SendMessageRequestBodyDTO,
    SetAuthorsNoteRequestBodyDTO,
    SetSittingOutRequestBodyDTO,
    SwapIdentityRequestBodyDTO,
    TurnRequestBodyDTO,
    WriteForMeRequestBodyDTO,
} from './dto/chat.request.dto.js';
import {
    BranchResponseBodyDTO,
    ChatDashboardResponseBodyDTO,
    ChatResponseBodyDTO,
    EditMessageResponseBodyDTO,
    ListChatsResponseBodyDTO,
} from './dto/chat.response.dto.js';
import { LoreInPlayResponseBodyDTO } from './dto/lore-in-play.response.dto.js';
import { DocumentsInPlayResponseBodyDTO } from './dto/documents-in-play.response.dto.js';
import { SuggestionsResponseBodyDTO } from './dto/suggestions.response.dto.js';
import { WriteForMeResponseBodyDTO } from './dto/write-for-me.response.dto.js';
import { ThaiReadingResponseBodyDTO } from './dto/thai-reading.response.dto.js';
import { answerTurn } from './turn-response.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Chats per Story: create, list, rename, reset, delete, swap the worn identity, send, retry,
 * continue, edit a Message, regenerate the newest reply, the read-only dashboard and a retry of either background call (spec: "API surface").
 *
 * The five turn endpoints (send, retry, continue, a User Message edit, regenerate) answer
 * server-sent events instead when asked with `Accept: text/event-stream` (see turn-response.ts),
 * so they write their own answer.
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

    /** Wears a Persona, or the Story's Role for null, from the next User Message on. Never rolled back. */
    @Put(':chatId/identity')
    @ApiOkResponse({ type: ChatResponseBodyDTO })
    swapIdentity(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: SwapIdentityRequestBodyDTO,
    ): Promise<ChatResponseBodyDTO> {
        return this.chatManager.swapIdentity(storyId, chatId, body.personaId);
    }

    /** Sets the Author's note, read from the next turn on; whitespace only clears it. Never rolled back. */
    @Put(':chatId/authors-note')
    @ApiOkResponse({ type: ChatResponseBodyDTO })
    setAuthorsNote(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: SetAuthorsNoteRequestBodyDTO,
    ): Promise<ChatResponseBodyDTO> {
        return this.chatManager.setAuthorsNote(storyId, chatId, body.text);
    }

    /** Replaces who is sitting out, read from the next turn on. Never rolled back. */
    @Put(':chatId/sitting-out')
    @ApiOkResponse({ type: ChatResponseBodyDTO })
    setSittingOut(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: SetSittingOutRequestBodyDTO,
    ): Promise<ChatResponseBodyDTO> {
        return this.chatManager.setSittingOut(storyId, chatId, body.characterIds);
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
    @ApiProduces('application/json', 'text/event-stream')
    send(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: SendMessageRequestBodyDTO,
        @Req() request: Request,
        @Res() response: Response,
    ): Promise<void> {
        return answerTurn<ChatResponseBodyDTO>(request, response, 201, (stream) =>
            this.chatManager.send(storyId, chatId, body.text, stream, body.nudgeCharacterId),
        );
    }

    @Post(':chatId/retry')
    @ApiOkResponse({ type: ChatResponseBodyDTO })
    @ApiProduces('application/json', 'text/event-stream')
    retry(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: TurnRequestBodyDTO,
        @Req() request: Request,
        @Res() response: Response,
    ): Promise<void> {
        return answerTurn<ChatResponseBodyDTO>(request, response, 200, (stream) =>
            this.chatManager.retry(storyId, chatId, stream, body?.nudgeCharacterId),
        );
    }

    /**
     * Spec: "Continue". The Narrator writes on without a User Message: the reply is stored as
     * an AI Message and nothing else. A failed call stores nothing; the error is the gateway's.
     */
    @Post(':chatId/continue')
    @ApiOkResponse({ type: ChatResponseBodyDTO })
    @ApiProduces('application/json', 'text/event-stream')
    continue(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: TurnRequestBodyDTO,
        @Req() request: Request,
        @Res() response: Response,
    ): Promise<void> {
        return answerTurn<ChatResponseBodyDTO>(request, response, 200, (stream) =>
            this.chatManager.continueChat(storyId, chatId, stream, body?.nudgeCharacterId),
        );
    }

    /**
     * Rewrites a Message, deletes every Message after it and rolls back the changes they
     * caused. A User Message gets a fresh reply (on a failed turn the error is the
     * gateway's); an AI Message is re-split from its `@Name:` text, judged again, and no
     * turn runs.
     */
    @Patch(':chatId/messages/:messageId')
    @ApiOkResponse({ type: EditMessageResponseBodyDTO })
    @ApiProduces('application/json', 'text/event-stream')
    editMessage(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('messageId') messageId: number,
        @Body() body: EditMessageRequestBodyDTO,
        @Req() request: Request,
        @Res() response: Response,
    ): Promise<void> {
        return answerTurn<EditMessageResponseBodyDTO>(request, response, 200, (stream) =>
            this.chatManager.editMessage(storyId, chatId, messageId, body.text, stream, body.nudgeCharacterId),
        );
    }

    /**
     * Spec: "Regenerate". Writes the Chat's newest AI Message again: its changes are rolled
     * back and the turn runs again (the User Message's turn, or a Continue); the new reply goes
     * into the same Message as its last Reply version, and the replaced one is kept. Answers
     * with the rollback counts like an edit. On a failed turn the error is the gateway's, and
     * the Message keeps the reply it had, judged and extracted from again.
     */
    @Post(':chatId/messages/:messageId/regenerate')
    @ApiOkResponse({ type: EditMessageResponseBodyDTO })
    @ApiProduces('application/json', 'text/event-stream')
    regenerate(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('messageId') messageId: number,
        @Body() body: TurnRequestBodyDTO,
        @Req() request: Request,
        @Res() response: Response,
    ): Promise<void> {
        return answerTurn<EditMessageResponseBodyDTO>(request, response, 200, (stream) =>
            this.chatManager.regenerateMessage(storyId, chatId, messageId, stream, body?.nudgeCharacterId),
        );
    }

    /**
     * Shows another Reply version of the newest AI Message (.scratch/swipe/spec.md): the shown
     * one's changes are rolled back and both background calls run on the chosen one. Answers
     * like an AI Message edit; the version already shown changes nothing.
     */
    @Put(':chatId/messages/:messageId/version')
    @ApiOkResponse({ type: EditMessageResponseBodyDTO })
    chooseVersion(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('messageId') messageId: number,
        @Body() body: ChooseReplyVersionRequestBodyDTO,
    ): Promise<EditMessageResponseBodyDTO> {
        return this.chatManager.chooseReplyVersion(storyId, chatId, messageId, body.version);
    }

    /**
     * Spec: .scratch/branch/spec.md. A new Chat, "<title> (branch)", holding this Chat's Messages
     * up to and including this one (up to the one before it, for a User Message, whose text comes
     * back as `draft`) with everything the Chat knew there. The source is not touched, and no
     * model is called.
     */
    @Post(':chatId/messages/:messageId/branch')
    @ApiCreatedResponse({ type: BranchResponseBodyDTO })
    branch(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('messageId') messageId: number,
    ): Promise<BranchResponseBodyDTO> {
        return this.chatManager.branchChat(storyId, chatId, messageId);
    }

    /**
     * Spec: .scratch/documents/spec.md, "Documents in play": the Document passages the last turn
     * used, or that its search failed. No model call.
     */
    @Get(':chatId/documents')
    @ApiOkResponse({ type: DocumentsInPlayResponseBodyDTO })
    documentsInPlay(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<DocumentsInPlayResponseBodyDTO> {
        return this.chatManager.documentsInPlay(storyId, chatId);
    }

    /** Spec: "Lore in play": the Lore entries a turn would send now, for the Memory drawer. */
    @Get(':chatId/lore')
    @ApiOkResponse({ type: LoreInPlayResponseBodyDTO })
    loreInPlay(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<LoreInPlayResponseBodyDTO> {
        return this.chatManager.loreInPlay(storyId, chatId);
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

    /** Runs the failed Memory extraction of the latest AI Message again, and only that. */
    @Post(':chatId/messages/:messageId/memory')
    @HttpCode(200)
    @ApiOkResponse({ type: ChatDashboardResponseBodyDTO })
    retryExtraction(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('messageId') messageId: number,
    ): Promise<ChatDashboardResponseBodyDTO> {
        return this.chatManager.retryExtraction(storyId, chatId, messageId);
    }

    /**
     * Spec: "Suggested replies". Three things the user might write next (an action, a line of
     * speech and a bold move), written as the worn identity. Nothing is stored in the Chat.
     * Refused while a turn is in flight or text credit is out; it never waits for the
     * previous reply's background calls.
     */
    @Post(':chatId/suggestions')
    @HttpCode(200)
    @ApiOkResponse({ type: SuggestionsResponseBodyDTO })
    async suggestions(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<SuggestionsResponseBodyDTO> {
        return { suggestions: await this.chatManager.suggestReplies(storyId, chatId) };
    }

    /**
     * .scratch/write-for-me/spec.md: the user's next Message, written in English as the worn
     * identity from the composer's draft, or from nothing. Nothing is stored in the Chat.
     * Refused while a turn is in flight or text credit is out, as Suggested replies are.
     */
    @Post(':chatId/write-for-me')
    @HttpCode(200)
    @ApiOkResponse({ type: WriteForMeResponseBodyDTO })
    async writeForMe(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: WriteForMeRequestBodyDTO,
    ): Promise<WriteForMeResponseBodyDTO> {
        return { text: await this.chatManager.writeForMe(storyId, chatId, body.draft) };
    }

    /**
     * .scratch/write-for-me/spec.md, "Thai reading": the Message's stored text in Thai, from the
     * background model. A text already read is answered from what was kept, with no call.
     */
    @Post(':chatId/messages/:messageId/thai-reading')
    @HttpCode(200)
    @ApiOkResponse({ type: ThaiReadingResponseBodyDTO })
    thaiReading(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Id('messageId') messageId: number,
    ): Promise<ThaiReadingResponseBodyDTO> {
        return this.chatManager.thaiReading(storyId, chatId, messageId);
    }

    /** Clears every Message and copies the current Opening in again; title and identity stay. */
    @Post(':chatId/reset')
    @HttpCode(200)
    @ApiOkResponse({ type: ChatResponseBodyDTO })
    reset(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<ChatResponseBodyDTO> {
        return this.chatManager.resetChat(storyId, chatId);
    }
}

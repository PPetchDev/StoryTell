import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Req, Res } from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { ChatManagerService } from '../../manager/chat/chat.service.js';
import { StartWatchRequestBodyDTO, WatchResponseBodyDTO, WatchStateResponseBodyDTO } from './dto/watch.dto.js';
import { LiveTurns } from './live-turns.js';
import { followWatch } from './watch-response.js';
import { WatchRuns } from './watch-runs.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Watch (.scratch/watch-mode/spec.md): the story plays on by itself for a number of replies,
 * written by the API whatever happens to the client. Start it, follow it, stop it.
 */
@ApiTags('Chats')
@Controller('stories/:storyId/chats/:chatId/watch')
export class WatchApiController {
    constructor(
        private readonly chatManager: ChatManagerService,
        private readonly watches: WatchRuns,
        private readonly turns: LiveTurns,
    ) {}

    /** Starts a Watch, refused as a Continue would be, while one runs, or while a Sudden event is under way. */
    @Post()
    @ApiCreatedResponse({ type: WatchResponseBodyDTO })
    start(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Body() body: StartWatchRequestBodyDTO): Promise<WatchResponseBodyDTO> {
        return this.watches.start(storyId, chatId, body.replies);
    }

    /**
     * The Chat's Watch, running or lately ended, and what a reply of this Chat costs. With
     * `Accept: text/event-stream`, the Watch as server-sent events until it ends.
     */
    @Get()
    @ApiOkResponse({ type: WatchStateResponseBodyDTO })
    @ApiProduces('application/json', 'text/event-stream')
    async state(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Req() request: Request, @Res() response: Response): Promise<void> {
        await this.chatManager.requireChat(storyId, chatId);
        const run = this.watches.find(chatId);
        if ((request.headers.accept ?? '').includes('text/event-stream')) {
            const replySoFar = run?.turnId ? this.turns.find(run.turnId, chatId)?.parts : undefined;
            await followWatch(run, response, replySoFar);
            return;
        }
        const body: WatchStateResponseBodyDTO = { watch: run?.view() ?? null, perReplyUsd: await this.chatManager.replyCostEstimate(storyId, chatId) };
        response.status(200).json(body);
    }

    /** Stops the Watch, once its step has unwound (nothing of that step is stored), and forgets it. */
    @Delete()
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'The Watch is stopped and forgotten, or there was none.' })
    async stop(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<void> {
        await this.chatManager.requireChat(storyId, chatId);
        await this.watches.stop(storyId, chatId);
    }
}

import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
    Query,
    Res,
    StreamableFile,
} from '@nestjs/common';
import {
    ApiAcceptedResponse,
    ApiCreatedResponse,
    ApiNoContentResponse,
    ApiOkResponse,
    ApiParam,
    ApiProduces,
    ApiQuery,
    ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';

import { SnapshotManagerService } from '../../manager/snapshot/snapshot.service.js';
import { DrawSnapshotRequestBodyDTO, WriteSnapshotPromptRequestBodyDTO } from './dto/snapshot.request.dto.js';
import {
    ChatSnapshotsResponseBodyDTO,
    GalleryResponseBodyDTO,
    SnapshotDTO,
    SnapshotJobDTO,
    SnapshotPromptDTO,
} from './dto/snapshot.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Snapshots and the Gallery (spec: "API surface"): write the Snapshot prompt of a Chat's latest
 * AI Message for the user to read, draw it (.scratch/snapshot-prompt-review/spec.md), follow its job, retry or dismiss a failed one; list a Story's Gallery, view, delete and
 * download one. The image itself is served by `GET /api/images/{imagePath}`.
 */
@ApiTags('Snapshots')
@Controller('stories/:storyId')
export class SnapshotApiController {
    constructor(private readonly snapshotManager: SnapshotManagerService) {}

    /** Writes the Snapshot prompt and answers once it is written; nothing is drawn until Draw. */
    @Post('chats/:chatId/snapshot-prompts')
    @HttpCode(201)
    @ApiCreatedResponse({
        type: SnapshotPromptDTO,
        description: "The Chat's one held Snapshot prompt, replacing any other: drawn once, or gone after an hour or a restart.",
    })
    writePrompt(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: WriteSnapshotPromptRequestBodyDTO,
    ): Promise<SnapshotPromptDTO> {
        return this.snapshotManager.writePrompt(storyId, chatId, body.hint ?? '', body.messageId);
    }

    /** Draw Snapshot: draws the held Snapshot prompt and answers at once; poll the Chat's Snapshots for the result. */
    @Post('chats/:chatId/snapshots')
    @HttpCode(202)
    @ApiAcceptedResponse({ type: SnapshotJobDTO, description: 'The job; it ends as a Snapshot or as a failed job.' })
    draw(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: DrawSnapshotRequestBodyDTO,
    ): Promise<SnapshotJobDTO> {
        return this.snapshotManager.draw(storyId, chatId, body.promptId, body.text);
    }

    @Get('chats/:chatId/snapshots')
    @ApiOkResponse({ type: ChatSnapshotsResponseBodyDTO })
    forChat(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<ChatSnapshotsResponseBodyDTO> {
        return this.snapshotManager.forChat(storyId, chatId);
    }

    @Post('chats/:chatId/snapshot-jobs/:jobId/retry')
    @HttpCode(202)
    @ApiAcceptedResponse({ type: SnapshotJobDTO, description: 'The failed job draws again: the same Message, hint and Snapshot prompt.' })
    retry(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Param('jobId') jobId: string,
    ): Promise<SnapshotJobDTO> {
        return this.snapshotManager.retry(storyId, chatId, jobId);
    }

    @Delete('chats/:chatId/snapshot-jobs/:jobId')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'The failed job is dismissed.' })
    dismiss(@Id('storyId') storyId: number, @Id('chatId') chatId: number, @Param('jobId') jobId: string): Promise<void> {
        return this.snapshotManager.dismiss(storyId, chatId, jobId);
    }

    @Get('gallery')
    @ApiQuery({ name: 'chatId', required: false, type: Number, description: 'Only the Snapshots taken in this Chat.' })
    @ApiOkResponse({ type: GalleryResponseBodyDTO })
    async gallery(
        @Id('storyId') storyId: number,
        @Query('chatId', new ParseIntPipe({ optional: true })) chatId?: number,
    ): Promise<GalleryResponseBodyDTO> {
        return { snapshots: await this.snapshotManager.gallery(storyId, chatId) };
    }

    @Get('snapshots/:snapshotId')
    @ApiOkResponse({ type: SnapshotDTO })
    get(@Id('storyId') storyId: number, @Id('snapshotId') snapshotId: number): Promise<SnapshotDTO> {
        return this.snapshotManager.get(storyId, snapshotId);
    }

    @Delete('snapshots/:snapshotId')
    @HttpCode(204)
    @ApiNoContentResponse({ description: 'The record and its file are gone, from the timeline and the Gallery.' })
    remove(@Id('storyId') storyId: number, @Id('snapshotId') snapshotId: number): Promise<void> {
        return this.snapshotManager.remove(storyId, snapshotId);
    }

    @Get('snapshots/:snapshotId/download')
    @ApiParam({ name: 'snapshotId' })
    @ApiProduces('image/png', 'image/jpeg', 'image/webp')
    @ApiOkResponse({ description: 'The image as an attachment.' })
    async download(
        @Id('storyId') storyId: number,
        @Id('snapshotId') snapshotId: number,
        @Res({ passthrough: true }) response: Response,
    ): Promise<StreamableFile> {
        const file = await this.snapshotManager.file(storyId, snapshotId);
        response.setHeader('Content-Type', file.mimeType);
        response.setHeader('Content-Length', file.size);
        response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
        return new StreamableFile(createReadStream(file.absolutePath));
    }
}

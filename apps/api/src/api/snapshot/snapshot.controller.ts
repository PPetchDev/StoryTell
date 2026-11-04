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
import { TakeSnapshotRequestBodyDTO } from './dto/snapshot.request.dto.js';
import {
    ChatSnapshotsResponseBodyDTO,
    GalleryResponseBodyDTO,
    SnapshotDTO,
    SnapshotJobDTO,
} from './dto/snapshot.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * Snapshots and the Gallery (spec: "API surface"): take one from a Chat's latest AI Message,
 * follow its job, retry or dismiss a failed one; list a Story's Gallery, view, delete and
 * download one. The image itself is served by `GET /api/images/{imagePath}`.
 */
@ApiTags('Snapshots')
@Controller('stories/:storyId')
export class SnapshotApiController {
    constructor(private readonly snapshotManager: SnapshotManagerService) {}

    /** Starts one Snapshot and answers at once; poll the Chat's Snapshots for the result. */
    @Post('chats/:chatId/snapshots')
    @HttpCode(202)
    @ApiAcceptedResponse({ type: SnapshotJobDTO, description: 'The job; it ends as a Snapshot or as a failed job.' })
    take(
        @Id('storyId') storyId: number,
        @Id('chatId') chatId: number,
        @Body() body: TakeSnapshotRequestBodyDTO,
    ): Promise<SnapshotJobDTO> {
        return this.snapshotManager.take(storyId, chatId, body.hint ?? '', body.messageId);
    }

    @Get('chats/:chatId/snapshots')
    @ApiOkResponse({ type: ChatSnapshotsResponseBodyDTO })
    forChat(@Id('storyId') storyId: number, @Id('chatId') chatId: number): Promise<ChatSnapshotsResponseBodyDTO> {
        return this.snapshotManager.forChat(storyId, chatId);
    }

    @Post('chats/:chatId/snapshot-jobs/:jobId/retry')
    @HttpCode(202)
    @ApiAcceptedResponse({ type: SnapshotJobDTO, description: 'The failed job runs again, with the same Message and hint.' })
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

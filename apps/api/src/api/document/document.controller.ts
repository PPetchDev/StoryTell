import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { DocumentManagerService } from '../../manager/document/document.service.js';
import { StoryResponseBodyDTO } from '../story/dto/story.response.dto.js';
import { FetchPageRequestBodyDTO, NewDocumentRequestBodyDTO, RenameDocumentRequestBodyDTO } from './dto/document.request.dto.js';
import { DocumentTextResponseBodyDTO, FetchedPageResponseBodyDTO } from './dto/document.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * A Story's Documents (.scratch/documents/spec.md). Every write answers the whole Story, like
 * every editor write. Adding is the only route that spends.
 */
@ApiTags('Documents')
@Controller('stories/:storyId/documents')
export class DocumentApiController {
    constructor(private readonly documentManager: DocumentManagerService) {}

    @Post()
    @ApiCreatedResponse({ type: StoryResponseBodyDTO, description: 'The whole Story, with the new Document last in `documents`.' })
    add(@Id('storyId') storyId: number, @Body() body: NewDocumentRequestBodyDTO): Promise<StoryResponseBodyDTO> {
        return this.documentManager.addDocument(storyId, body);
    }

    /** The page's title and text for the Add sheet; stores nothing, spends nothing. */
    @Post('fetch-page')
    @HttpCode(200)
    @ApiOkResponse({ type: FetchedPageResponseBodyDTO })
    fetchPage(@Id('storyId') storyId: number, @Body() body: FetchPageRequestBodyDTO): Promise<FetchedPageResponseBodyDTO> {
        return this.documentManager.fetchPage(storyId, body.url);
    }

    @Get(':documentId')
    @ApiOkResponse({ type: DocumentTextResponseBodyDTO })
    read(@Id('storyId') storyId: number, @Id('documentId') documentId: number): Promise<DocumentTextResponseBodyDTO> {
        return this.documentManager.readDocument(storyId, documentId);
    }

    @Patch(':documentId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    rename(
        @Id('storyId') storyId: number,
        @Id('documentId') documentId: number,
        @Body() body: RenameDocumentRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.documentManager.renameDocument(storyId, documentId, body.title);
    }

    @Delete(':documentId')
    @ApiOkResponse({ type: StoryResponseBodyDTO })
    remove(@Id('storyId') storyId: number, @Id('documentId') documentId: number): Promise<StoryResponseBodyDTO> {
        return this.documentManager.removeDocument(storyId, documentId);
    }
}

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Res, StreamableFile } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ReferenceImageManagerService } from '../../manager/reference-image/reference-image.service.js';
import { StoryManagerService } from '../../manager/story/story.service.js';
import { StoryResponseBodyDTO } from '../story/dto/story.response.dto.js';
import { PickReferenceImageRequestBodyDTO } from './dto/reference-image.request.dto.js';
import { GenerateReferenceCandidatesResponseBodyDTO } from './dto/reference-image.response.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/**
 * A Character's Reference image (spec: "Reference image"): generate a round of candidates,
 * look at them, pick one, or remove the image. The picked image is served like any other by
 * `GET /api/images/{path}`, from the Character's `referenceImagePath`.
 */
@ApiTags('Reference images')
@Controller('stories/:storyId/characters/:characterId/reference-image')
export class ReferenceImageApiController {
    constructor(
        private readonly referenceImageManager: ReferenceImageManagerService,
        private readonly storyManager: StoryManagerService,
    ) {}

    @Post('candidates')
    @ApiCreatedResponse({
        type: GenerateReferenceCandidatesResponseBodyDTO,
        description: 'Up to 4 candidates, held until one is picked or a newer round replaces them.',
    })
    generateCandidates(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
    ): Promise<GenerateReferenceCandidatesResponseBodyDTO> {
        return this.referenceImageManager.generateCandidates(storyId, characterId);
    }

    @Get('candidates/:candidateId')
    @ApiParam({ name: 'candidateId', description: 'A candidate id from the latest round.' })
    @ApiProduces('image/png', 'image/jpeg', 'image/webp')
    @ApiOkResponse({ description: 'The candidate image.' })
    async candidate(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Param('candidateId') candidateId: string,
        @Res({ passthrough: true }) response: Response,
    ): Promise<StreamableFile> {
        const image = await this.referenceImageManager.openCandidate(storyId, characterId, candidateId);
        response.setHeader('Content-Type', image.mimeType);
        response.setHeader('Content-Length', image.bytes.length);
        // Candidates are one-off: a browser must not show a stale one under a reused id.
        response.setHeader('Cache-Control', 'no-store');
        return new StreamableFile(image.bytes);
    }

    @Put()
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The picked candidate is now the Reference image.' })
    pick(
        @Id('storyId') storyId: number,
        @Id('characterId') characterId: number,
        @Body() body: PickReferenceImageRequestBodyDTO,
    ): Promise<StoryResponseBodyDTO> {
        return this.referenceImageManager.pickCandidate(storyId, characterId, body.candidateId);
    }

    @Delete()
    @ApiOkResponse({ type: StoryResponseBodyDTO, description: 'The Character has no Reference image again.' })
    remove(@Id('storyId') storyId: number, @Id('characterId') characterId: number): Promise<StoryResponseBodyDTO> {
        return this.storyManager.removeReferenceImage(storyId, characterId);
    }
}

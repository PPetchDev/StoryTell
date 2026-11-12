import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';

import { ImageManagerService } from '../../manager/image/image.service.js';
import { THUMBNAIL_WIDTHS } from '../../store/image/image-store.service.js';

/**
 * Every stored image has a name of its own, and a replaced picture gets a new one, so what a path
 * answers never changes: browsers may keep it for a year without asking again (audit H33).
 * Private, because images need a sign-in (.scratch/sign-in/spec.md): no shared cache in front
 * (a tunnel, a CDN) may keep one and hand it to anyone.
 */
const IMMUTABLE = 'private, max-age=31536000, immutable';

@ApiTags('Images')
@Controller('images')
export class ImageApiController {
    constructor(private readonly imageManager: ImageManagerService) {}

    @Get('*path')
    @ApiParam({
        name: 'path',
        description: 'Path of the file relative to the image folder, e.g. `snapshots/12.png`.',
    })
    @ApiQuery({
        name: 'w',
        required: false,
        enum: [...THUMBNAIL_WIDTHS],
        description: 'Answer a WebP thumbnail this many pixels wide (never wider than the image) instead of the file.',
    })
    @ApiProduces('image/png', 'image/jpeg', 'image/webp')
    @ApiOkResponse({ description: 'The image file, or its thumbnail.' })
    async get(
        @Param('path') segments: string[],
        @Query('w') width: string | undefined,
        @Res({ passthrough: true }) response: Response,
    ): Promise<StreamableFile> {
        const image = await this.imageManager.openImage(segments.join('/'), width);
        response.setHeader('Content-Type', image.mimeType);
        response.setHeader('Content-Length', image.size);
        response.setHeader('Cache-Control', IMMUTABLE);
        return new StreamableFile(createReadStream(image.absolutePath));
    }
}

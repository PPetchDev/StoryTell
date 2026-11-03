import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';

import { ImageManagerService } from '../../manager/image/image.service.js';

@ApiTags('Images')
@Controller('images')
export class ImageApiController {
    constructor(private readonly imageManager: ImageManagerService) {}

    @Get('*path')
    @ApiParam({
        name: 'path',
        description: 'Path of the file relative to the image folder, e.g. `snapshots/12.png`.',
    })
    @ApiProduces('image/png', 'image/jpeg', 'image/webp')
    @ApiOkResponse({ description: 'The image file.' })
    async get(
        @Param('path') segments: string[],
        @Res({ passthrough: true }) response: Response,
    ): Promise<StreamableFile> {
        const image = await this.imageManager.openImage(segments.join('/'));
        response.setHeader('Content-Type', image.mimeType);
        response.setHeader('Content-Length', image.size);
        return new StreamableFile(createReadStream(image.absolutePath));
    }
}

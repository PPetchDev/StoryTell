import { Body, Controller, Delete, Get, Param, ParseEnumPipe, ParseIntPipe, Patch, Post, Put, UploadedFile, UseFilters, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiParam, ApiTags } from '@nestjs/swagger';

import { NoImageFileError } from '../../errors/image.errors.js';

import { PlaceManagerService } from '../../manager/place/place.service.js';
import type { StageLight } from '../../model/stage/stage.entities.js';
import { MAX_UPLOAD_MB, UploadTooLargeFilter } from '../expression/expression.controller.js';
import {
    AddPlaceRequestBodyDTO,
    ChangePlaceRequestBodyDTO,
    DrawPlaceRequestBodyDTO,
    PlacesResponseBodyDTO,
    RemoveMetPlaceRequestBodyDTO,
    UploadPlaceRequestBodyDTO,
} from './dto/place.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

/** Day, evening or night; anything else is a 400. */
const Light = () => Param('light', new ParseEnumPipe({ day: 'day', evening: 'evening', night: 'night' }));

/** The part of a multer file this controller reads. */
interface UploadedImage {
    buffer: Buffer;
}

/** Places drawn ahead (.scratch/places-ahead/spec.md). Every write answers the Story's Places. */
@ApiTags('Places')
@Controller('stories/:storyId/places')
export class PlaceApiController {
    constructor(private readonly places: PlaceManagerService) {}

    @Get()
    @ApiOkResponse({ type: PlacesResponseBodyDTO })
    list(@Id('storyId') storyId: number): Promise<PlacesResponseBodyDTO> {
        return this.places.list(storyId);
    }

    @Post()
    @ApiCreatedResponse({ type: PlacesResponseBodyDTO, description: 'Refused with no name, a name the Story has, or a 31st Place (422.003.161).' })
    add(@Id('storyId') storyId: number, @Body() body: AddPlaceRequestBodyDTO): Promise<PlacesResponseBodyDTO> {
        return this.places.add(storyId, body);
    }

    /** Before `:placeId`, so "met" is never read as an id. */
    @Post('met/remove')
    @ApiCreatedResponse({ type: PlacesResponseBodyDTO, description: "Removes a place met in play: its pictures, by its key. A Place's own key is left alone." })
    removeMet(@Id('storyId') storyId: number, @Body() body: RemoveMetPlaceRequestBodyDTO): Promise<PlacesResponseBodyDTO> {
        return this.places.removeMet(storyId, body.key);
    }

    @Patch(':placeId')
    @ApiOkResponse({ type: PlacesResponseBodyDTO, description: 'A new name takes its pictures along.' })
    change(@Id('storyId') storyId: number, @Id('placeId') placeId: number, @Body() body: ChangePlaceRequestBodyDTO): Promise<PlacesResponseBodyDTO> {
        return this.places.change(storyId, placeId, body);
    }

    @Delete(':placeId')
    @ApiOkResponse({ type: PlacesResponseBodyDTO, description: 'Removes the Place and its pictures.' })
    remove(@Id('storyId') storyId: number, @Id('placeId') placeId: number): Promise<PlacesResponseBodyDTO> {
        return this.places.remove(storyId, placeId);
    }

    @Post(':placeId/draw')
    @ApiCreatedResponse({
        type: PlacesResponseBodyDTO,
        description:
            'Draws it in that light now, replacing any picture there: one `place_picture` call. Refused before any call with the Venice pool used up (402.001.004), ' +
            'evening or night with no day picture (409.003.163), or while it draws (409.003.162).',
    })
    draw(@Id('storyId') storyId: number, @Id('placeId') placeId: number, @Body() body: DrawPlaceRequestBodyDTO): Promise<PlacesResponseBodyDTO> {
        return this.places.draw(storyId, placeId, body.light);
    }

    @Put(':placeId/pictures/:light')
    @UseFilters(UploadTooLargeFilter)
    @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
    @ApiConsumes('multipart/form-data')
    @ApiParam({ name: 'light', enum: ['day', 'evening', 'night'] })
    @ApiBody({ type: UploadPlaceRequestBodyDTO })
    @ApiOkResponse({
        type: PlacesResponseBodyDTO,
        description:
            'The picture is now the Place in that light, replacing any there; no call and no credit. Any light, with or without a day picture. ' +
            'Refused with no file (400.002.008), a file that is not a picture (415.002.009), over 15 MB (413.002.010), or while that light draws (409.003.162).',
    })
    upload(
        @Id('storyId') storyId: number,
        @Id('placeId') placeId: number,
        @Light() light: StageLight,
        @UploadedFile() file: UploadedImage | undefined,
    ): Promise<PlacesResponseBodyDTO> {
        if (!file) throw new NoImageFileError();
        return this.places.upload(storyId, placeId, light, file.buffer);
    }
}

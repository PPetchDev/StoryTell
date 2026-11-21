import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { PlaceManagerService } from '../../manager/place/place.service.js';
import { AddPlaceRequestBodyDTO, ChangePlaceRequestBodyDTO, DrawPlaceRequestBodyDTO, PlacesResponseBodyDTO, RemoveMetPlaceRequestBodyDTO } from './dto/place.dto.js';

const Id = (name: string) => Param(name, ParseIntPipe);

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
}

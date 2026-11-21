import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import type { MetPlaceView, PlacePictures, PlacesView, PlaceView } from '../../../manager/place/place.service.js';
import { PLACE_LOOKS_MAX, PLACE_NAME_MAX } from '../../../manager/place/place.service.js';
import type { StageLight } from '../../../model/stage/stage.entities.js';

export class AddPlaceRequestBodyDTO {
    @ApiProperty({ description: 'What the story calls it; the Judge answers with this name when the story is there.' })
    @IsString()
    @MaxLength(PLACE_NAME_MAX)
    name: string;

    @ApiPropertyOptional({ description: 'How it looks, in a few words; what its picture is drawn from with its name.' })
    @IsOptional()
    @IsString()
    @MaxLength(PLACE_LOOKS_MAX)
    looks?: string;
}

export class ChangePlaceRequestBodyDTO {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(PLACE_NAME_MAX)
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(PLACE_LOOKS_MAX)
    looks?: string;
}

export class DrawPlaceRequestBodyDTO {
    @ApiProperty({ enum: ['day', 'evening', 'night'], description: 'Day is drawn from words; evening and night are edits of the day picture.' })
    @IsIn(['day', 'evening', 'night'])
    light: StageLight;
}

export class RemoveMetPlaceRequestBodyDTO {
    @ApiProperty({ description: 'The place as play wrote it (its key).' })
    @IsString()
    @MaxLength(200)
    key: string;
}

export class PlacePictureDTO {
    @ApiProperty({ enum: ['drawing', 'ready', 'failed'] })
    status: 'drawing' | 'ready' | 'failed';

    @ApiProperty({ type: String, nullable: true, description: 'Relative to the image folder.' })
    imagePath: string | null;
}

export class PlacePicturesDTO implements PlacePictures {
    @ApiProperty({ type: PlacePictureDTO, nullable: true })
    day: PlacePictureDTO | null;

    @ApiProperty({ type: PlacePictureDTO, nullable: true })
    evening: PlacePictureDTO | null;

    @ApiProperty({ type: PlacePictureDTO, nullable: true })
    night: PlacePictureDTO | null;
}

export class PlaceDTO implements PlaceView {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;

    @ApiProperty()
    looks: string;

    @ApiProperty({ type: PlacePicturesDTO })
    pictures: PlacePicturesDTO;
}

export class MetPlaceDTO implements MetPlaceView {
    @ApiProperty({ description: 'The place as play wrote it, lowercased.' })
    key: string;

    @ApiProperty({ type: PlacePicturesDTO })
    pictures: PlacePicturesDTO;
}

export class PlacesResponseBodyDTO implements PlacesView {
    @ApiProperty({ type: [PlaceDTO], description: "The Story's Places, in order." })
    places: PlaceDTO[];

    @ApiProperty({ type: [MetPlaceDTO], description: 'Places Chats drew in play that are not Places, with at least one picture drawn.' })
    met: MetPlaceDTO[];
}

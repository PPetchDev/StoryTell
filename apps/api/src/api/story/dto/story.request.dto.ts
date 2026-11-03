import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    ValidateIf,
} from 'class-validator';

import {
    CharacterFields,
    NewStartingBond,
    RoleFields,
    SceneFields,
    StartingBondFields,
    StoryFields,
} from '../../../manager/story/story.service.js';
import { Pov, ReplyLength, Tense } from '../../../model/story/entities/story.entity.js';

// Long enough for any passage an author writes, short enough to refuse a runaway client.
const TEXT_MAX = 20_000;

/** Fields of the Story itself. Every field is optional, so autosave can send one at a time. */
export class StoryRequestBodyDTO implements StoryFields {
    @ApiPropertyOptional({ description: 'The Story title.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    title?: string;

    @ApiPropertyOptional({ description: 'The Setting: place, situation, premise and tone.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    setting?: string;

    @ApiPropertyOptional({ description: 'The Opening passage that begins every Chat.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    opening?: string;

    @ApiPropertyOptional({ enum: Pov, description: 'Style: point of view.' })
    @IsOptional()
    @IsEnum(Pov)
    pov?: Pov;

    @ApiPropertyOptional({ enum: Tense, description: 'Style: tense.' })
    @IsOptional()
    @IsEnum(Tense)
    tense?: Tense;

    @ApiPropertyOptional({ enum: ReplyLength, description: 'Style: reply length.' })
    @IsOptional()
    @IsEnum(ReplyLength)
    replyLength?: ReplyLength;

    @ApiPropertyOptional({ description: 'Style: Image style, in plain language.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    imageStyle?: string;
}

export class RoleRequestBodyDTO implements RoleFields {
    @ApiPropertyOptional({ description: 'The name of the part the user plays.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    name?: string;

    @ApiPropertyOptional({ description: 'Who the Role is, for the Characters.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    description?: string;
}

export class CharacterRequestBodyDTO implements CharacterFields {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    name?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    appearance?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    personality?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    voice?: string;

    @ApiPropertyOptional({ type: [String], description: 'Example lines, in order.' })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(50)
    @IsString({ each: true })
    @MaxLength(TEXT_MAX, { each: true })
    exampleLines?: string[];

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    background?: string;

    @ApiPropertyOptional({ description: 'What only this Character knows, as one text block.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    secrets?: string;

    @ApiPropertyOptional({ description: 'Arc directions, as one text block.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    arcDirections?: string;
}

export class CharacterOrderRequestBodyDTO {
    @ApiProperty({ type: [Number], description: "Every Character id of the Story, in the new order." })
    @IsArray()
    @IsInt({ each: true })
    characterIds: number[];
}

export class StartingBondRequestBodyDTO implements StartingBondFields {
    @ApiPropertyOptional({ description: 'A short label for the feeling, e.g. "wary".' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    label?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    description?: string;
}

export class NewStartingBondRequestBodyDTO extends StartingBondRequestBodyDTO implements NewStartingBond {
    @ApiProperty({ description: 'The Character that holds the feeling.' })
    @IsInt()
    fromCharacterId: number;

    @ApiProperty({
        type: Number,
        nullable: true,
        description: 'The Character the feeling is toward, or null for the Role.',
    })
    @ValidateIf((_, value) => value !== null)
    @IsInt()
    toCharacterId: number | null;
}

export class SceneRequestBodyDTO implements SceneFields {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    name?: string;

    @ApiPropertyOptional({ description: 'The situation or goal of the Scene.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    situation?: string;

    @ApiPropertyOptional({
        description: 'When the story moves on, in plain language. Only the last Scene may leave it empty.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    moveOnCondition?: string;
}

export class SceneOrderRequestBodyDTO {
    @ApiProperty({ type: [Number], description: "Every Scene id of the Story, in the new order." })
    @IsArray()
    @IsInt({ each: true })
    sceneIds: number[];
}

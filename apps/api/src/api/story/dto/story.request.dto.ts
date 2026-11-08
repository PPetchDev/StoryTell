import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsEnum,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateIf,
} from 'class-validator';

import {
    CharacterFields,
    NewStartingBond,
    RoleFields,
    LoreEntryFields,
    LoreTriggerFields,
    SceneFields,
    StartingBondFields,
    StoryFields,
} from '../../../manager/story/story.service.js';
import { LORE_GROUP_MAX, LORE_SECONDARY_MODES, LORE_TIMED_MAX } from '../../../model/story/entities/lore-entry.entity.js';
import type { LoreSecondaryMode } from '../../../model/story/entities/lore-entry.entity.js';
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

/** Spec: "Lore". Every field is optional, so autosave can send one at a time. */
export class LoreEntryRequestBodyDTO implements LoreEntryFields, LoreTriggerFields {
    @ApiPropertyOptional({ description: 'What the entry is about; it also counts as a keyword.' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    name?: string;

    @ApiPropertyOptional({ type: [String], description: 'Other words that bring the entry into a turn: names, plurals, Thai words.' })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @IsString({ each: true })
    @MaxLength(100, { each: true })
    keywords?: string[];

    @ApiPropertyOptional({ description: 'The note itself, sent to the Narrator when the entry comes up.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    text?: string;

    @ApiPropertyOptional({ description: 'Sent on every turn, whether or not it comes up.' })
    @IsOptional()
    @IsBoolean()
    alwaysOn?: boolean;

    @ApiPropertyOptional({
        type: [String],
        description: 'Second keywords: they filter an entry whose name, keyword or pattern came up, by `secondaryMode`; they never bring one up.',
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(20)
    @IsString({ each: true })
    @MaxLength(100, { each: true })
    secondaryKeywords?: string[];

    @ApiPropertyOptional({
        enum: LORE_SECONDARY_MODES,
        description: '`alsoNeeds`: one of the second keywords must be there too. `unless`: none of them may be there.',
    })
    @IsOptional()
    @IsIn(LORE_SECONDARY_MODES)
    secondaryMode?: LoreSecondaryMode;

    @ApiPropertyOptional({
        type: [String],
        description:
            'Patterns: regular-expression sources (no slashes or flags), matched ignoring case, Unicode and multi-line, that bring the entry up like keywords. One that does not compile is `InvalidLorePatternError`.',
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(10)
    @IsString({ each: true })
    @MaxLength(200, { each: true })
    patterns?: string[];

    @ApiPropertyOptional({ description: '"Brought in by other entries": named in the text of a chosen entry, it comes along (default true).' })
    @IsOptional()
    @IsBoolean()
    recursable?: boolean;

    @ApiPropertyOptional({ minimum: 0, maximum: LORE_TIMED_MAX, description: '"Stays for": Messages it stays in after it went in, mentioned or not; 0 = off.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(LORE_TIMED_MAX)
    sticky?: number;

    @ApiPropertyOptional({ minimum: 0, maximum: LORE_TIMED_MAX, description: '"Rests for": Messages after its stay when it cannot come in by any route; 0 = off.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(LORE_TIMED_MAX)
    cooldown?: number;

    @ApiPropertyOptional({ minimum: 0, maximum: LORE_TIMED_MAX, description: '"Waits until the Chat has" this many Messages before it can come in; 0 = off.' })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(LORE_TIMED_MAX)
    delay?: number;

    @ApiPropertyOptional({
        minimum: 0,
        maximum: 100,
        description: '"Chance": the percentage of the times it would come in that it does, rolled once per Message; 100 = no roll.',
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(100)
    chance?: number;

    @ApiPropertyOptional({
        maxLength: LORE_GROUP_MAX,
        description: '"Group": at most one entry of a group goes in per turn (compared ignoring case); blank = none.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(LORE_GROUP_MAX)
    group?: string;
}

export class SceneOrderRequestBodyDTO {
    @ApiProperty({ type: [Number], description: "Every Scene id of the Story, in the new order." })
    @IsArray()
    @IsInt({ each: true })
    sceneIds: number[];
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { READ_ALOUD_LANGUAGES } from '../../../model/story/entities/story.entity.js';
import type { ReadAloudLanguage } from '../../../model/story/entities/story.entity.js';
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
    ValidateNested,
    Min,
    ValidateIf,
} from 'class-validator';

import {
    CharacterFields,
    NewStartingBond,
    RoleFields,
    LoreEntryFields,
    LoreTriggerFields,
    SceneBondGateFields,
    SceneFields,
    StartingBondFields,
    SuddenEventFields,
    EndingFields,
    StoryFields,
} from '../../../manager/story/story.service.js';
import { OPENING_QUESTION_TEXT_MAX } from '../../../manager/story/opening-questions.js';
import { BOND_AXES, BOND_AXIS_RANGE } from '../../../model/ledger/bond-axes.js';
import type { BondAxis } from '../../../model/ledger/bond-axes.js';
import { LORE_GROUP_MAX, LORE_SECONDARY_MODES, LORE_TIMED_MAX } from '../../../model/story/entities/lore-entry.entity.js';
import type { LoreSecondaryMode } from '../../../model/story/entities/lore-entry.entity.js';
import { Backdrop, Balance, Difficulty, Pacing, Pov, ReplyLength, Tense } from '../../../model/story/entities/story.entity.js';
import { GaugeDirection, SUDDEN_EVENT_TURNS } from '../../../model/story/entities/sudden-event.entity.js';

// Long enough for any passage an author writes, short enough to refuse a runaway client.
const TEXT_MAX = 20_000;
// A Gauge's name is a word or two, shown on the Chat screen.
const SUDDEN_EVENT_GAUGE_MAX = 40;
// Far longer than any Kokoro voice id ("af_sky"); the voice list decides what is known.
const VOICE_ID_MAX = 100;

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

    @ApiPropertyOptional({ enum: Pacing, description: 'Style: how fast the story moves. `natural` leaves it to the Narrator.' })
    @IsOptional()
    @IsEnum(Pacing)
    pacing?: Pacing;

    @ApiPropertyOptional({ enum: Balance, description: 'Style: lean on dialogue, or on action and description. `balanced` leaves it to the Narrator.' })
    @IsOptional()
    @IsEnum(Balance)
    balance?: Balance;

    @ApiPropertyOptional({ enum: Difficulty, description: "Style: how readily the world lets the user's attempts succeed. `normal` leaves it to the Narrator." })
    @IsOptional()
    @IsEnum(Difficulty)
    difficulty?: Difficulty;

    @ApiPropertyOptional({ description: 'Style: Image style, in plain language.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    imageStyle?: string;

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: 'The voice narration is read aloud in: an id from GET /api/voices, or null for the default.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(VOICE_ID_MAX)
    narrationVoice?: string | null;

    @ApiPropertyOptional({ enum: READ_ALOUD_LANGUAGES, description: 'The language Read aloud speaks: English as written, or a Japanese dub (.scratch/japanese-dub/spec.md).' })
    @IsOptional()
    @IsIn(READ_ALOUD_LANGUAGES)
    readAloudLanguage?: ReadAloudLanguage;

    @ApiPropertyOptional({ type: String, nullable: true, description: "A Japanese dub's narration voice: an id from GET /api/voices' dubNarrationVoices, or null for the default." })
    @IsOptional()
    @IsString()
    @MaxLength(VOICE_ID_MAX)
    dubNarrationVoice?: string | null;

    @ApiPropertyOptional({ enum: Backdrop, description: "What sits behind the Story's Chats: nothing, the Cover, or the Chat's newest Snapshot." })
    // Optional, but never null: null is not one of the three.
    @ValidateIf((_body, value) => value !== undefined)
    @IsEnum(Backdrop)
    backdrop?: Backdrop;

    @ApiPropertyOptional({ description: "Whether the Judge may offer a Roll at a key moment (.scratch/judge-rolls/spec.md). On by default." })
    @ValidateIf((_body, value) => value !== undefined)
    @IsBoolean()
    rollOffers?: boolean;
}

/** One of a Role's Stats (.scratch/judge-rolls/spec.md); the manager checks the rules across the list. */
export class RoleStatRequestDTO {
    @ApiProperty({ description: "The Stat's name, 1 to 24 characters on one line, unique in the Role ignoring case." })
    @IsString()
    @MaxLength(100)
    name: string;

    @ApiProperty({ description: "What it adds to a Roll made for it: a whole number from -3 to 5." })
    @IsInt()
    value: number;
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

    @ApiPropertyOptional({ type: [RoleStatRequestDTO], description: "The Role's Stats, at most 6, replacing the whole list (.scratch/judge-rolls/spec.md)." })
    @ValidateIf((_body, value) => value !== undefined)
    @IsArray()
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => RoleStatRequestDTO)
    stats?: RoleStatRequestDTO[];
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

    @ApiPropertyOptional({
        type: String,
        nullable: true,
        description: 'The voice their lines are read aloud in: an id from GET /api/voices, or null to use the Narration voice.',
    })
    @IsOptional()
    @IsString()
    @MaxLength(VOICE_ID_MAX)
    speakingVoice?: string | null;

    @ApiPropertyOptional({ type: String, nullable: true, description: "Their voice in a Japanese dub: an id from GET /api/voices' dubVoices, or null for the default." })
    @IsOptional()
    @IsString()
    @MaxLength(VOICE_ID_MAX)
    dubVoice?: string | null;
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

    // Starting levels on the Bond axes (.scratch/bond-axes/spec.md, "Storage"); the editor shows only their words.
    @ApiPropertyOptional({ minimum: -3, maximum: 3, description: 'Starting Trust: betrayed (−3) … trusts completely (+3). Default 0.' })
    @IsOptional()
    @IsInt()
    @Min(BOND_AXIS_RANGE.trust.min)
    @Max(BOND_AXIS_RANGE.trust.max)
    trust?: number;

    @ApiPropertyOptional({ minimum: -3, maximum: 3, description: 'Starting Affection: hates (−3) … devoted (+3). Default 0.' })
    @IsOptional()
    @IsInt()
    @Min(BOND_AXIS_RANGE.affection.min)
    @Max(BOND_AXIS_RANGE.affection.max)
    affection?: number;

    @ApiPropertyOptional({ minimum: -3, maximum: 3, description: 'Starting Desire: repelled (−3) … aches for (+3). Default 0.' })
    @IsOptional()
    @IsInt()
    @Min(BOND_AXIS_RANGE.desire.min)
    @Max(BOND_AXIS_RANGE.desire.max)
    desire?: number;

    @ApiPropertyOptional({ minimum: 0, maximum: 3, description: 'Starting Tension: at ease (0) … at breaking point (3). Default 0.' })
    @IsOptional()
    @IsInt()
    @Min(BOND_AXIS_RANGE.tension.min)
    @Max(BOND_AXIS_RANGE.tension.max)
    tension?: number;
}

/**
 * One Bond gate in the whole list a Scene's gates are replaced with (.scratch/bond-axes/spec.md,
 * "API"). The level is checked against its own axis's range, and the Characters against the cast,
 * when the list is saved.
 */
export class SceneBondGateRequestDTO implements SceneBondGateFields {
    @ApiProperty({ description: 'The Character whose feelings it reads.' })
    @IsInt()
    fromCharacterId: number;

    @ApiProperty({ type: Number, nullable: true, description: 'Toward whom; null means toward the user.' })
    @ValidateIf((_object, value) => value !== null)
    @IsInt()
    toCharacterId: number | null;

    @ApiProperty({ enum: BOND_AXES })
    @IsIn(BOND_AXES)
    axis: BondAxis;

    @ApiProperty({ minimum: -3, maximum: 3, description: 'The least level: Trust, Affection and Desire −3 to 3, Tension 0 to 3.' })
    @IsInt()
    @Min(-3)
    @Max(3)
    atLeast: number;
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

/** A Sudden event's fields (.scratch/sudden-events/spec.md). Every field is optional, so autosave can send one at a time. */
export class SuddenEventRequestBodyDTO implements SuddenEventFields {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    name?: string;

    @ApiPropertyOptional({ description: 'When it starts, in plain language.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    trigger?: string;

    @ApiPropertyOptional({ description: 'What the Gauge measures, e.g. "Suspicion".' })
    @IsOptional()
    @IsString()
    @MaxLength(SUDDEN_EVENT_GAUGE_MAX)
    gauge?: string;

    @ApiPropertyOptional({ enum: GaugeDirection, description: 'Whether the user must bring the Gauge down or up.' })
    @IsOptional()
    @IsEnum(GaugeDirection)
    direction?: GaugeDirection;

    @ApiPropertyOptional({ minimum: SUDDEN_EVENT_TURNS.min, maximum: SUDDEN_EVENT_TURNS.max, description: 'How many replies the user has.' })
    @IsOptional()
    @IsInt()
    @Min(SUDDEN_EVENT_TURNS.min)
    @Max(SUDDEN_EVENT_TURNS.max)
    turns?: number;

    @ApiPropertyOptional({ description: 'What follows a success, for the Narrator.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    success?: string;

    @ApiPropertyOptional({ description: 'What follows a failure, for the Narrator.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    failure?: string;
}

/** "Let the story make up events" (.scratch/ai-events/spec.md). */
export class AiEventsRequestBodyDTO {
    @ApiProperty({ description: "On: the Judge may propose Sudden events of its own in the Story's Chats." })
    @IsBoolean()
    on: boolean;
}

/** An Ending's fields (.scratch/endings/spec.md). Every field is optional, so autosave can send one at a time. */
export class EndingRequestBodyDTO implements EndingFields {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    name?: string;

    @ApiPropertyOptional({ description: 'When the story has reached it, in plain language.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    condition?: string;

    @ApiPropertyOptional({ description: 'What its Epilogue should tell, for the Narrator.' })
    @IsOptional()
    @IsString()
    @MaxLength(TEXT_MAX)
    epilogue?: string;
}

/** A new Lore set, linked to the Story (.scratch/shared-lore/spec.md). */
export class CreateLoreSetRequestBodyDTO {
    @ApiPropertyOptional({ description: 'Its name; may be left out and written later.' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    name?: string;

    @ApiPropertyOptional({ description: "True moves the Story's own Lore entries into the new set, so other Stories can link them. Left out or false: the set starts empty." })
    @IsOptional()
    @IsBoolean()
    moveLore?: boolean;
}

/** The Lore sets a Story links, in order: the whole list at once. */
export class LinkLoreSetsRequestBodyDTO {
    @ApiProperty({ type: [Number], description: 'Lore set ids of this Account, each once, at most five. An empty list unlinks them all.' })
    @IsArray()
    @IsInt({ each: true })
    loreSetIds: number[];
}

export class RenameLoreSetRequestBodyDTO {
    @ApiProperty({ description: 'Shown in every Story that links the set; may be empty.' })
    @IsString()
    @MaxLength(200)
    name: string;
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

/** One Starting Belief (.scratch/memory-by-meaning/spec.md, "Starting Beliefs"). */
export class StartingBeliefRequestDTO {
    @ApiProperty({ description: 'The Character who believes it when a Chat starts.' })
    @IsInt()
    characterId: number;

    @ApiProperty({ description: 'What they believe, which may be false. Write `{user}` where it names the user.' })
    @IsString()
    @MaxLength(2_000)
    text: string;
}

/** The whole list of Starting Beliefs, in order: it replaces what the Story has. */
export class StartingBeliefsRequestBodyDTO {
    @ApiProperty({ type: [StartingBeliefRequestDTO] })
    @IsArray()
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => StartingBeliefRequestDTO)
    startingBeliefs: StartingBeliefRequestDTO[];
}

/** One Opening question (.scratch/opening-questions/spec.md). The rules beyond shape are the manager's (422). */
export class OpeningQuestionRequestDTO {
    @ApiProperty({ description: 'The placeholder, written `{key}` in the Opening and the Role: a–z, 0–9 and _, starting with a letter.', example: 'name' })
    @IsString()
    @MaxLength(OPENING_QUESTION_TEXT_MAX)
    key: string;

    @ApiProperty({ description: 'What the user is asked when a Chat starts.', example: 'What is your name?' })
    @IsString()
    @MaxLength(OPENING_QUESTION_TEXT_MAX)
    question: string;

    @ApiProperty({ description: 'Used when the user skips the question or leaves it blank.', example: 'Aria' })
    @IsString()
    @MaxLength(OPENING_QUESTION_TEXT_MAX)
    defaultAnswer: string;
}

/** The whole list of Opening questions, in order: it replaces what the Story has. */
export class OpeningQuestionsRequestBodyDTO {
    @ApiProperty({ type: [OpeningQuestionRequestDTO] })
    @IsArray()
    // A runaway client only: more than MAX_OPENING_QUESTIONS is the manager's 422.
    @ArrayMaxSize(50)
    @ValidateNested({ each: true })
    @Type(() => OpeningQuestionRequestDTO)
    openingQuestions: OpeningQuestionRequestDTO[];
}

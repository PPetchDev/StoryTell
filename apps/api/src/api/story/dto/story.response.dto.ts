import { ApiProperty } from '@nestjs/swagger';

import { MissingField } from '../../../manager/story/playable.js';
import { LatestChat, StoryDetail, StoryListItem } from '../../../manager/story/story.service.js';
import { DOCUMENT_SOURCES, DocumentSummary } from '../../../model/document/entities/document.entity.js';
import type { DocumentSource } from '../../../model/document/entities/document.entity.js';
import { EXPRESSION_EMOTIONS } from '../../../model/story/emotion.js';
import type { ExpressionEmotion } from '../../../model/story/emotion.js';
import { ExpressionResponse } from '../../../model/story/entities/character-expression.entity.js';
import { CharacterResponse, PortraitCrop } from '../../../model/story/entities/character.entity.js';
import { RoleResponse } from '../../../model/story/entities/role.entity.js';
import { SavedReplyDTO } from '../../saved-reply/dto/saved-reply.response.dto.js';
import { ReplaceRuleDTO } from '../../replace-rule/dto/replace-rule.response.dto.js';
import { LORE_SECONDARY_MODES, LoreEntryResponse } from '../../../model/story/entities/lore-entry.entity.js';
import type { LoreSecondaryMode } from '../../../model/story/entities/lore-entry.entity.js';
import { SceneResponse } from '../../../model/story/entities/scene.entity.js';
import { StartingBondResponse } from '../../../model/story/entities/starting-bond.entity.js';
import {
    CoverFocus,
    CoverSource,
    Pov,
    ReplyLength,
    StoryCover,
    Tense,
} from '../../../model/story/entities/story.entity.js';

export class CoverFocusDTO implements CoverFocus {
    @ApiProperty({ description: "Across, as a fraction of the picture's width.", minimum: 0, maximum: 1 })
    x: number;

    @ApiProperty({ description: "Down, as a fraction of the picture's height.", minimum: 0, maximum: 1 })
    y: number;
}

export class StoryCoverDTO implements StoryCover {
    @ApiProperty({ enum: CoverSource, description: 'Only an `upload` owns its file; the others point at a Snapshot or a Reference image.' })
    source: CoverSource;

    @ApiProperty({ description: 'Relative to the image folder, served at `GET /api/images/{path}`.' })
    imagePath: string;

    @ApiProperty({ type: CoverFocusDTO, nullable: true, description: 'The point kept in view when it is cropped; null centres it.' })
    focus: CoverFocusDTO | null;

    @ApiProperty({ type: Number, nullable: true, description: 'The Snapshot it shows, for `snapshot`.' })
    snapshotId: number | null;

    @ApiProperty({ type: Number, nullable: true, description: 'The Character whose Reference image it shows, for `reference_image`.' })
    characterId: number | null;
}

export class LatestChatDTO implements LatestChat {
    @ApiProperty({ description: 'Chat id.' })
    id: number;

    @ApiProperty({ type: String, nullable: true, description: 'The Scene the Chat is on; null for free play.' })
    sceneName: string | null;
}

export class StorySummaryDTO implements StoryListItem {
    @ApiProperty({ description: 'Story id.', example: 1 })
    id: number;

    @ApiProperty({ description: 'The Story title as the author wrote it.' })
    title: string;

    @ApiProperty({ description: 'Whether every required field is filled.' })
    playable: boolean;

    @ApiProperty({ description: 'When the Story was created (ISO 8601).' })
    createdAt: string;

    @ApiProperty({ description: 'When the Story was last saved (ISO 8601).' })
    updatedAt: string;

    @ApiProperty({ type: () => [MissingFieldDTO], description: 'Required fields still empty; empty when playable.' })
    missing: MissingFieldDTO[];

    @ApiProperty({
        type: String,
        nullable: true,
        description: 'When its most recently played Chat was last played (ISO 8601); null when it has no Chats.',
    })
    lastPlayedAt: string | null;

    @ApiProperty({
        type: () => LatestChatDTO,
        nullable: true,
        description: 'Its most recently played Chat; null when it has no Chats.',
    })
    latestChat: LatestChatDTO | null;

    @ApiProperty({
        type: String,
        nullable: true,
        description:
            "The card's picture, relative to the image folder: the Cover when one is chosen, else the newest Snapshot; " +
            'null when there is neither.',
    })
    coverImagePath: string | null;

    @ApiProperty({
        type: CoverFocusDTO,
        nullable: true,
        description: "The Cover's focus point; null for the newest Snapshot or a Cover with none chosen.",
    })
    coverFocus: CoverFocusDTO | null;

    @ApiProperty({ description: "The Setting's first sentence, cut to about 120 characters; empty when there is none." })
    hook: string;
}

export class ListStoriesResponseBodyDTO {
    @ApiProperty({
        description: 'Every Story, most recently saved first.',
        type: [StorySummaryDTO],
    })
    stories: StorySummaryDTO[];
}

export class StyleDTO {
    @ApiProperty({ enum: Pov })
    pov: Pov;

    @ApiProperty({ enum: Tense })
    tense: Tense;

    @ApiProperty({ enum: ReplyLength })
    replyLength: ReplyLength;

    @ApiProperty({ description: 'Image style in plain language. Empty when unset.' })
    imageStyle: string;
}

export class RoleDTO implements RoleResponse {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;

    @ApiProperty()
    description: string;
}

export class PortraitCropDTO implements PortraitCrop {
    @ApiProperty({ description: "Left edge, as a fraction of the image's width." })
    x: number;

    @ApiProperty({ description: "Top edge, as a fraction of the image's width." })
    y: number;

    @ApiProperty({ description: "Side of the square, as a fraction of the image's width." })
    size: number;
}

export class ExpressionDTO implements ExpressionResponse {
    @ApiProperty({ enum: EXPRESSION_EMOTIONS, description: 'The emotion it shows. "neutral" never has one: the Portrait is the neutral face.' })
    emotion: ExpressionEmotion;

    @ApiProperty({ description: 'Relative to the image folder, served at `GET /api/images/{path}`.' })
    imagePath: string;

    @ApiProperty({ type: PortraitCropDTO, nullable: true, description: "Its own square of its picture; null uses the Portrait's." })
    crop: PortraitCrop | null;

    @ApiProperty({ description: 'Drawn from a Reference image the Character no longer has. Never true for an upload.' })
    outdated: boolean;
}

export class CharacterDTO implements CharacterResponse {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;

    @ApiProperty()
    appearance: string;

    @ApiProperty()
    personality: string;

    @ApiProperty()
    voice: string;

    @ApiProperty({ type: [String] })
    exampleLines: string[];

    @ApiProperty()
    background: string;

    @ApiProperty()
    secrets: string;

    @ApiProperty()
    arcDirections: string;

    @ApiProperty({
        type: String,
        nullable: true,
        description:
            'Path of the Reference image relative to the image folder, served at `GET /api/images/{path}`; ' +
            'null while there is none. Shown on the Character page and, cropped to the Portrait, in a Chat.',
    })
    referenceImagePath: string | null;

    @ApiProperty({
        type: PortraitCropDTO,
        nullable: true,
        description: 'The square of the Reference image shown beside their lines in a Chat; null while none is chosen.',
    })
    portraitCrop: PortraitCrop | null;

    @ApiProperty({
        type: String,
        nullable: true,
        description: 'The voice their lines are read aloud in; null reads them in the Narration voice. Apart from `voice`.',
    })
    speakingVoice: string | null;

    @ApiProperty({ type: [ExpressionDTO], description: 'Their picture per emotion, in the fixed order of the emotions.' })
    expressions: ExpressionDTO[];
}

export class StartingBondDTO implements StartingBondResponse {
    @ApiProperty()
    id: number;

    @ApiProperty()
    fromCharacterId: number;

    @ApiProperty({ type: Number, nullable: true, description: 'null means toward the Role.' })
    toCharacterId: number | null;

    @ApiProperty()
    label: string;

    @ApiProperty()
    description: string;
}

export class SceneDTO implements SceneResponse {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;

    @ApiProperty()
    situation: string;

    @ApiProperty()
    moveOnCondition: string;
}

export class LoreEntryDTO implements LoreEntryResponse {
    @ApiProperty()
    id: number;

    @ApiProperty({ description: 'What the entry is about; it also counts as a keyword.' })
    name: string;

    @ApiProperty({ type: [String] })
    keywords: string[];

    @ApiProperty()
    text: string;

    @ApiProperty({ description: 'Sent on every turn, whether or not it comes up.' })
    alwaysOn: boolean;

    @ApiProperty({ type: [String], description: 'Second keywords: they filter an entry that came up, by `secondaryMode`.' })
    secondaryKeywords: string[];

    @ApiProperty({ enum: LORE_SECONDARY_MODES })
    secondaryMode: LoreSecondaryMode;

    @ApiProperty({ type: [String], description: 'Patterns: regular-expression sources that bring the entry up like keywords.' })
    patterns: string[];

    @ApiProperty({ description: '"Brought in by other entries".' })
    recursable: boolean;

    @ApiProperty({ description: '"Stays for", in Messages; 0 = off.' })
    sticky: number;

    @ApiProperty({ description: '"Rests for", in Messages; 0 = off.' })
    cooldown: number;

    @ApiProperty({ description: '"Waits until the Chat has", in Messages; 0 = off.' })
    delay: number;

    @ApiProperty({ description: '"Chance", 0–100; 100 means no roll.' })
    chance: number;

    @ApiProperty({ description: '"Group"; blank = none.' })
    group: string;
}

export class DocumentSummaryDTO implements DocumentSummary {
    @ApiProperty()
    id: number;

    @ApiProperty()
    title: string;

    @ApiProperty({ enum: DOCUMENT_SOURCES })
    source: DocumentSource;

    @ApiProperty({ type: String, nullable: true, description: 'The file name or the page URL; null for pasted text.' })
    sourceName: string | null;

    @ApiProperty({ description: "How many characters the Document's text has." })
    characters: number;

    @ApiProperty({ description: 'How many passages it was split into.' })
    passages: number;

    @ApiProperty()
    createdAt: string;
}

export class MissingFieldDTO implements MissingField {
    @ApiProperty({ description: 'Stable field path, e.g. `role.name` or `characters.0.voice`.' })
    field: string;

    @ApiProperty({ description: 'What to tell the author, e.g. "Mira: Voice".' })
    label: string;
}

/** The whole Story with its derived playable status. Every write answers with this. */
export class StoryResponseBodyDTO implements StoryDetail {
    @ApiProperty()
    id: number;

    @ApiProperty()
    title: string;

    @ApiProperty()
    setting: string;

    @ApiProperty()
    opening: string;

    @ApiProperty({ type: StyleDTO })
    style: StyleDTO;

    @ApiProperty({ type: RoleDTO })
    role: RoleDTO;

    @ApiProperty({ type: [CharacterDTO], description: 'In cast order.' })
    characters: CharacterDTO[];

    @ApiProperty({ type: [StartingBondDTO] })
    startingBonds: StartingBondDTO[];

    @ApiProperty({ type: [SceneDTO], description: 'In play order.' })
    scenes: SceneDTO[];

    @ApiProperty({ type: [LoreEntryDTO], description: 'In add order.' })
    lore: LoreEntryDTO[];

    @ApiProperty({ type: [DocumentSummaryDTO], description: 'In add order, without text or vectors.' })
    documents: DocumentSummaryDTO[];

    @ApiProperty({ type: [SavedReplyDTO], description: "The Story's own Saved replies, in add order." })
    savedReplies: SavedReplyDTO[];

    @ApiProperty({ type: [ReplaceRuleDTO], description: "The Story's own Replace rules, in order; they run after the app-wide ones." })
    replaceRules: ReplaceRuleDTO[];

    @ApiProperty({ type: StoryCoverDTO, nullable: true, description: 'The picture the author chose; null while there is none.' })
    cover: StoryCoverDTO | null;

    @ApiProperty({ type: String, nullable: true, description: 'The voice narration is read aloud in; null for the default (GET /api/voices).' })
    narrationVoice: string | null;

    @ApiProperty({ description: 'True when `missing` is empty.' })
    playable: boolean;

    @ApiProperty({ type: [MissingFieldDTO], description: 'Required fields still empty.' })
    missing: MissingFieldDTO[];

    @ApiProperty()
    createdAt: string;

    @ApiProperty()
    updatedAt: string;
}

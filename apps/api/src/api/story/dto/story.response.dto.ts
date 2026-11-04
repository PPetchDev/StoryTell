import { ApiProperty } from '@nestjs/swagger';

import { MissingField } from '../../../manager/story/playable.js';
import { StoryDetail, StoryListItem } from '../../../manager/story/story.service.js';
import { CharacterResponse } from '../../../model/story/entities/character.entity.js';
import { RoleResponse } from '../../../model/story/entities/role.entity.js';
import { SceneResponse } from '../../../model/story/entities/scene.entity.js';
import { StartingBondResponse } from '../../../model/story/entities/starting-bond.entity.js';
import { Pov, ReplyLength, Tense } from '../../../model/story/entities/story.entity.js';

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
            'null while there is none. Shown only on the Character page, never in play.',
    })
    referenceImagePath: string | null;
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

    @ApiProperty({ description: 'True when `missing` is empty.' })
    playable: boolean;

    @ApiProperty({ type: [MissingFieldDTO], description: 'Required fields still empty.' })
    missing: MissingFieldDTO[];

    @ApiProperty()
    createdAt: string;

    @ApiProperty()
    updatedAt: string;
}

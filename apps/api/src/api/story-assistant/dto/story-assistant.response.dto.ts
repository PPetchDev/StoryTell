import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Change } from '../../../manager/story-assistant/change-set-schema.js';
import {
    AppliedChange,
    AssistantResult,
    PendingChangeSet,
} from '../../../manager/story-assistant/story-assistant.service.js';
import { StoryResponseBodyDTO } from '../../story/dto/story.response.dto.js';

export class AppliedChangeDTO {
    @ApiProperty({ enum: ['set', 'add', 'remove'], description: 'A field set, a Character/Scene/Bond added, or one removed.' })
    kind: 'set' | 'add' | 'remove';

    @ApiProperty({ enum: ['story', 'role', 'character', 'scene', 'startingBond'] })
    target: 'story' | 'role' | 'character' | 'scene' | 'startingBond';

    @ApiPropertyOptional({ description: 'The Character, Scene or StartingBond changed or added; absent for story, role and removals.' })
    id?: number;

    @ApiPropertyOptional({ description: 'Set only: the field, e.g. `voice` or `moveOnCondition`.' })
    field?: string;

    @ApiPropertyOptional({ description: 'Set only: the value before, for Undo. A list for exampleLines.' })
    before?: string | string[];

    @ApiPropertyOptional({ description: 'Set only: the value written.' })
    after?: string | string[];

    @ApiProperty({ description: 'For the change list, e.g. "Mira: Voice", "Character Lena", "Scene Arrival".' })
    label: string;
}

export class PendingChangeSetDTO implements PendingChangeSet {
    @ApiProperty({ type: [Object], description: 'The validated change set, to send back to `apply` once confirmed.' })
    changes: Change[];

    @ApiProperty({ type: [String], description: 'What it would remove, e.g. "Character Mira".' })
    removals: string[];
}

export class AssistantResponseBodyDTO implements AssistantResult {
    @ApiProperty({ type: StoryResponseBodyDTO, description: 'The Story after the changes, or unchanged when they are pending.' })
    story: StoryResponseBodyDTO;

    @ApiProperty({ description: "The assistant's one or two sentences to the author." })
    reply: string;

    @ApiProperty({ type: [AppliedChangeDTO], description: 'The changes applied, in the order applied. Empty when pending.' })
    changes: AppliedChange[];

    @ApiPropertyOptional({
        type: PendingChangeSetDTO,
        nullable: true,
        description: 'Set when the changes would remove a Character or Scene and removals were not confirmed.',
    })
    pending: PendingChangeSet | null;
}

import { ApiProperty } from '@nestjs/swagger';

import { MemoriesInPlayDTO } from '../../chat/dto/chat.response.dto.js';
import { BeliefDTO } from './belief.response.dto.js';
import { MemoryList } from '../../../manager/chat/memory/memory.service.js';
import { MemoryAuthor, MemoryResponse } from '../../../model/memory/entities/memory.entity.js';

export class MemoryDTO implements MemoryResponse {
    @ApiProperty()
    id: number;

    @ApiProperty({ description: 'The fact, with `{user}` where it names the user. Render it as `identityName`.' })
    text: string;

    @ApiProperty({ type: [Number], description: 'The Characters who know it, in cast order. May be empty.' })
    knownBy: number[];

    @ApiProperty({ enum: MemoryAuthor, description: 'Who wrote the current text.' })
    writtenBy: MemoryAuthor;

    @ApiProperty({ description: 'A locked Memory takes no AI update, delete, merge or archive; Known-by additions still land.' })
    locked: boolean;

    @ApiProperty({ description: 'Archived Memories are out of the prompt and listed in the collapsed section.' })
    archived: boolean;

    @ApiProperty({ type: Number, nullable: true, description: 'The AI Message that added it; null when the user wrote it.' })
    messageId: number | null;

    @ApiProperty()
    createdAt: string;
}

export class MemoryCastMemberDTO {
    @ApiProperty()
    id: number;

    @ApiProperty()
    name: string;
}

/** The Memory drawer's data (spec: "Memory drawer"). */
export class MemoryListResponseBodyDTO implements MemoryList {
    @ApiProperty()
    chatId: number;

    @ApiProperty()
    storyId: number;

    @ApiProperty({ description: 'The worn identity, which `{user}` renders as.' })
    identityName: string;

    @ApiProperty({ type: [MemoryCastMemberDTO], description: 'In cast order, for Known-by chips and the add form.' })
    cast: MemoryCastMemberDTO[];

    @ApiProperty({ type: [Number], description: 'The Characters present in the latest exchange: a hand-added Memory is known by these.' })
    present: number[];

    @ApiProperty({ type: [MemoryDTO], description: 'Active and archived, oldest first.' })
    memories: MemoryDTO[];

    @ApiProperty({ type: [BeliefDTO], description: 'Every Belief, given-up ones included, oldest first.' })
    beliefs: BeliefDTO[];

    @ApiProperty({ type: MemoriesInPlayDTO, description: 'The Memories and Beliefs the last turn sent, shown as "In play".' })
    inPlay: MemoriesInPlayDTO;

    @ApiProperty({ description: 'True when the locked Memories alone take more than half the Memory budget.' })
    lockedWarning: boolean;
}

export class MemoryResponseBodyDTO extends MemoryDTO {}

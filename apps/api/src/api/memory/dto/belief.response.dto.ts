import { ApiProperty } from '@nestjs/swagger';

import { BeliefAuthor, BeliefResponse } from '../../../model/memory/entities/belief.entity.js';

export class BeliefGivenUpDTO {
    @ApiProperty({ description: 'The AI Message that showed the truth.' })
    messageId: number;

    @ApiProperty({ description: "That Message as one plain line, for \"Gave this up: …\"." })
    line: string;
}

/** A Belief (.scratch/memory-by-meaning/spec.md, "Beliefs"). */
export class BeliefDTO implements BeliefResponse {
    @ApiProperty()
    id: number;

    @ApiProperty({ description: 'The Character who holds it.' })
    characterId: number;

    @ApiProperty({ description: 'What they believe, with `{user}` where it names the user. Render it as the worn identity.' })
    text: string;

    @ApiProperty({ type: Number, nullable: true, description: 'The Memory it contradicts ("Doesn\'t match: …"); null for none.' })
    contradictsMemoryId: number | null;

    @ApiProperty({ enum: BeliefAuthor, description: 'Who wrote the current text.' })
    writtenBy: BeliefAuthor;

    @ApiProperty({ type: Number, nullable: true, description: 'The AI Message whose extraction made it; null when the user wrote it or a Starting Belief seeded it.' })
    messageId: number | null;

    @ApiProperty({ type: BeliefGivenUpDTO, nullable: true, description: 'Null while it is held.' })
    givenUp: BeliefGivenUpDTO | null;

    @ApiProperty()
    createdAt: string;
}

export class BeliefResponseBodyDTO extends BeliefDTO {}

import { ApiProperty } from '@nestjs/swagger';

import { CandidateRound, ReferenceCandidate } from '../../../manager/reference-image/reference-image.service.js';

export class ReferenceCandidateDTO implements ReferenceCandidate {
    @ApiProperty({
        description:
            'Candidate id. Its image is served at `.../reference-image/candidates/{id}` until it is picked, ' +
            'replaced by a newer round, or expires.',
    })
    id: string;
}

export class GenerateReferenceCandidatesResponseBodyDTO implements CandidateRound {
    @ApiProperty({ type: [ReferenceCandidateDTO], description: 'The candidates that came back, up to 4.' })
    candidates: ReferenceCandidateDTO[];

    @ApiProperty({ description: 'How many of the 4 calls failed while at least one succeeded.' })
    failed: number;

    @ApiProperty({ type: String, nullable: true, description: 'The first failure, when `failed` is above 0.' })
    failureMessage: string | null;
}

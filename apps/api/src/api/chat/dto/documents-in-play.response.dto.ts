import { ApiProperty } from '@nestjs/swagger';

import type { DocumentPassageInPlay, DocumentsInPlay } from '../../../manager/chat/document-search.service.js';

export class DocumentPassageInPlayDTO implements DocumentPassageInPlay {
    @ApiProperty()
    documentId: number;

    @ApiProperty()
    documentTitle: string;

    @ApiProperty({ description: "The passage's place in its Document, from 0." })
    position: number;

    @ApiProperty({ description: "The passage's first ~160 characters." })
    excerpt: string;
}

/** Spec: .scratch/documents/spec.md, "Documents in play". */
export class DocumentsInPlayResponseBodyDTO implements DocumentsInPlay {
    @ApiProperty({ description: 'Whether the Story has any Document; the Memory drawer shows the card only then.' })
    hasDocuments: boolean;

    @ApiProperty({
        enum: ['none', 'found', 'failed'],
        description: "The newest AI Message's search: `none` until a turn has searched, `failed` when the search failed at the embedding host.",
    })
    status: 'none' | 'found' | 'failed';

    @ApiProperty({ type: [DocumentPassageInPlayDTO], description: 'The passages the last turn sent that still exist, in the order sent.' })
    passages: DocumentPassageInPlayDTO[];
}

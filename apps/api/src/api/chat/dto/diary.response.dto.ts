import { ApiProperty } from '@nestjs/swagger';

import type { DiaryEntryResponse } from '../../../model/ledger/entities/diary-entry.entity.js';

export class DiaryEntryResponseBodyDTO implements DiaryEntryResponse {
    @ApiProperty()
    id: number;

    @ApiProperty({ description: 'The Character who wrote it.' })
    characterId: number;

    @ApiProperty({ description: 'The AI Message the story stood at when it was written. The entry goes when that Message is rewound.' })
    messageId: number;

    @ApiProperty({ type: String, nullable: true, description: 'The Time of day and the Place then ("Night, the lamp room"); null when the Chat knew neither.' })
    moment: string | null;

    @ApiProperty({ description: "The entry, in the Character's own voice. Never sent to the AI as part of the story." })
    text: string;

    @ApiProperty()
    createdAt: string;
}

export class DiaryResponseBodyDTO {
    @ApiProperty({ type: [DiaryEntryResponseBodyDTO], description: "Every Character's entries in this Chat, newest first." })
    entries: DiaryEntryResponseBodyDTO[];
}
